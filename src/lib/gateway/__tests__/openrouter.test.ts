import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GatewayError,
  isGatewayConfigured,
  parseSseLine,
  streamChatCompletion,
} from "../openrouter";

/** Build a streaming 2xx Response from raw SSE text chunks. */
function sseResponse(chunks: string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, ...init });
}

/** One `data:` frame carrying a content delta. */
function delta(text: string): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content: text } }],
  })}\n\n`;
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const piece of gen) out.push(piece);
  return out;
}

describe("parseSseLine", () => {
  it("extracts a content delta from a data frame", () => {
    expect(parseSseLine(delta("Hello").trim())).toBe("Hello");
    expect(
      parseSseLine('data: {"choices":[{"delta":{"content":"hi"}}]}'),
    ).toBe("hi");
  });

  it("ignores blank lines, comments, and the DONE sentinel", () => {
    expect(parseSseLine("")).toBeNull();
    expect(parseSseLine("   ")).toBeNull();
    expect(parseSseLine(": OPENROUTER PROCESSING")).toBeNull();
    expect(parseSseLine("data: [DONE]")).toBeNull();
  });

  it("ignores non-data events and empty deltas", () => {
    expect(parseSseLine("event: message")).toBeNull();
    expect(parseSseLine('data: {"choices":[{"delta":{}}]}')).toBeNull();
    expect(
      parseSseLine('data: {"choices":[{"delta":{"content":""}}]}'),
    ).toBeNull();
  });

  it("returns null for malformed JSON without throwing", () => {
    expect(parseSseLine("data: {not valid json}")).toBeNull();
  });
});

describe("isGatewayConfigured", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true only for a non-empty key", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-test");
    expect(isGatewayConfigured()).toBe(true);
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(isGatewayConfigured()).toBe(false);
  });
});

describe("streamChatCompletion", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reassembles multi-chunk deltas in order, including a split data line", () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        delta("Hello"),
        delta(", "),
        // A single data frame split across two network chunks.
        'data: {"choices":[{"delta":',
        '{"content":"world"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    return expect(
      collect(
        streamChatCompletion({
          system: "s",
          messages: [{ role: "user", content: "hi" }],
        }),
      ),
    ).resolves.toEqual(["Hello", ", ", "world"]);
  });

  it("ignores comment keep-alive lines", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        ": OPENROUTER PROCESSING\n\n",
        delta("a"),
        ": OPENROUTER PROCESSING\n\n",
        delta("b"),
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await collect(
      streamChatCompletion({
        system: "s",
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    expect(result).toEqual(["a", "b"]);
  });

  it("stops at [DONE] and drops anything after it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([delta("kept"), "data: [DONE]\n\n", delta("dropped")]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await collect(
      streamChatCompletion({
        system: "s",
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    expect(result).toEqual(["kept"]);
  });

  it("skips a malformed JSON line without killing the stream", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        delta("before"),
        "data: {not json}\n\n",
        delta("after"),
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await collect(
      streamChatCompletion({
        system: "s",
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    expect(result).toEqual(["before", "after"]);
  });

  it("throws GatewayError with status on a non-2xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("rate limit exceeded", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const gen = streamChatCompletion({
      system: "s",
      messages: [{ role: "user", content: "hi" }],
    });

    await expect(collect(gen)).rejects.toMatchObject({
      name: "GatewayError",
      status: 429,
    });
    await expect(
      collect(
        streamChatCompletion({
          system: "s",
          messages: [{ role: "user", content: "hi" }],
        }),
      ),
    ).rejects.toBeInstanceOf(GatewayError);
  });

  it("throws before calling fetch when the key is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      collect(
        streamChatCompletion({
          system: "s",
          messages: [{ role: "user", content: "hi" }],
        }),
      ),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the documented endpoint, headers, and body defaults", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    await collect(
      streamChatCompletion({
        system: "system prompt",
        messages: [{ role: "user", content: "hi" }],
      }),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["HTTP-Referer"]).toBe("https://cadre-ai-chatbot.vercel.app");
    expect(headers["X-Title"]).toBe("Cadre AI Support Concierge");

    const parsed = JSON.parse(init.body as string);
    expect(parsed.model).toBe("anthropic/claude-haiku-4.5");
    expect(parsed.max_tokens).toBe(600);
    expect(parsed.temperature).toBe(0.2);
    expect(parsed.stream).toBe(true);
    expect(parsed.messages[0]).toEqual({
      role: "system",
      content: "system prompt",
    });
    expect(parsed.messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("honors OPENROUTER_MODEL from env and the model override", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "openai/gpt-5-mini");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    await collect(
      streamChatCompletion({ system: "s", messages: [] }),
    );
    expect(
      JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
        .model,
    ).toBe("openai/gpt-5-mini");

    await collect(
      streamChatCompletion({
        system: "s",
        messages: [],
        model: "anthropic/claude-sonnet-4.5",
      }),
    );
    expect(
      JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
        .model,
    ).toBe("anthropic/claude-sonnet-4.5");
  });

  it("adds the models fallback array only when configured and not overridden", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    const bodyOfCall = (n: number) =>
      JSON.parse((fetchMock.mock.calls[n][1] as RequestInit).body as string);

    // No fallback configured: no models array.
    await collect(streamChatCompletion({ system: "s", messages: [] }));
    expect(bodyOfCall(0).models).toBeUndefined();

    // Fallback configured: primary + fallback, in order.
    vi.stubEnv("OPENROUTER_FALLBACK_MODEL", "openai/gpt-5-mini");
    await collect(streamChatCompletion({ system: "s", messages: [] }));
    expect(bodyOfCall(1).models).toEqual([
      "anthropic/claude-haiku-4.5",
      "openai/gpt-5-mini",
    ]);

    // Explicit per-call model override (benchmark): never a fallback.
    await collect(
      streamChatCompletion({
        system: "s",
        messages: [],
        model: "anthropic/claude-sonnet-4.5",
      }),
    );
    expect(bodyOfCall(2).models).toBeUndefined();

    // Fallback equal to the primary: dropped.
    vi.stubEnv("OPENROUTER_FALLBACK_MODEL", "anthropic/claude-haiku-4.5");
    await collect(streamChatCompletion({ system: "s", messages: [] }));
    expect(bodyOfCall(3).models).toBeUndefined();
  });

  it("clamps OPENROUTER_MAX_TOKENS and falls back on invalid values", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    const maxTokensFor = async (raw: string): Promise<number> => {
      vi.stubEnv("OPENROUTER_MAX_TOKENS", raw);
      await collect(streamChatCompletion({ system: "s", messages: [] }));
      const call = fetchMock.mock.calls.at(-1) as [string, RequestInit];
      return JSON.parse(call[1].body as string).max_tokens;
    };

    expect(await maxTokensFor("50")).toBe(50);
    expect(await maxTokensFor("5000")).toBe(2000);
    expect(await maxTokensFor("0")).toBe(1);
    expect(await maxTokensFor("not-a-number")).toBe(600);
  });

  it("propagates an AbortError from fetch unchanged", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      collect(streamChatCompletion({ system: "s", messages: [] })),
    ).rejects.toBe(abortError);
  });
});
