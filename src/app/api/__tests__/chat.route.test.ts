import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { StreamEvent } from "@/lib/chat/types";
import {
  GatewayError,
  isGatewayConfigured,
  streamChatCompletion,
} from "@/lib/gateway/openrouter";
import { checkRateLimit } from "@/lib/limits/ratelimit";
import { storeTurn } from "@/lib/conversations/store";
import { knowledgeBase } from "@/lib/prompt/knowledge";
import { POST } from "../chat/route";

// Callbacks handed to next/server's `after()` are captured here so a test can
// assert whether post-response storage was scheduled, and are run synchronously
// so the mocked storeTurn is observable within the request.
const hoisted = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((cb: () => unknown) => {
      hoisted.afterCallbacks.push(cb);
      cb();
    }),
  };
});

// Partial mock keeps GatewayError the real class (route uses `instanceof`
// indirectly via the mapped error) while letting us drive the two seams.
vi.mock("@/lib/gateway/openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gateway/openrouter")>();
  return {
    ...actual,
    isGatewayConfigured: vi.fn(),
    streamChatCompletion: vi.fn(),
  };
});

// Partial mocks preserve each module's real export shape so signature drift
// in unmocked exports stays visible to the type checker.
vi.mock("@/lib/limits/ratelimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/limits/ratelimit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn(),
  };
});

// Only the PostgREST-touching write is mocked; the token module stays real and
// is driven through stubbed env so tests mint genuine signed tokens.
vi.mock("@/lib/conversations/store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/conversations/store")>();
  return {
    ...actual,
    storeTurn: vi.fn(async () => {}),
  };
});

const SIGNING_SECRET = "test-signing-secret";
const SUPABASE_URL = "https://project.supabase.co";
const SUPABASE_KEY = "secret-service-key";
const TURN_ID = "22222222-2222-2222-2222-222222222222";

function stubStorageEnv() {
  vi.stubEnv("CONVERSATION_SIGNING_SECRET", SIGNING_SECRET);
  vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("SUPABASE_SECRET_KEY", SUPABASE_KEY);
}

function chatRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Read an NDJSON response fully and JSON.parse each line into a typed event. */
async function readEvents(res: Response): Promise<StreamEvent[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as StreamEvent);
}

/** Async generator over `deltas`, optionally throwing after the last yield. */
function stream(deltas: string[], throwAfter?: Error) {
  return (async function* () {
    for (const delta of deltas) yield delta;
    if (throwAfter) throw throwAfter;
  })();
}

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  hoisted.afterCallbacks.length = 0;
  stubStorageEnv();
  vi.mocked(isGatewayConfigured).mockReturnValue(true);
  vi.mocked(checkRateLimit).mockResolvedValue({ ok: true });
  vi.mocked(streamChatCompletion).mockReturnValue(stream(["Hi."]));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/chat", () => {
  it("C1: happy path emits text -> conversation -> action -> done in order", async () => {
    vi.mocked(streamChatCompletion).mockReturnValue(stream(["Hello ", "there."]));
    const res = await POST(
      chatRequest({
        messages: [{ role: "user", content: "What is your pricing?" }],
        turnId: TURN_ID,
      }),
    );

    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await readEvents(res);
    const types = events.map((e) => e.type);

    // The COMPLETE sequence, in order: the two text deltas exactly as the
    // gateway yielded them, one conversation event, one or more actions,
    // then the terminal done — nothing else, nothing reordered.
    expect(events[0]).toEqual({ type: "text", delta: "Hello " });
    expect(events[1]).toEqual({ type: "text", delta: "there." });
    expect(types[2]).toBe("conversation");
    const actionCount = types.filter((t) => t === "action").length;
    expect(actionCount).toBeGreaterThan(0);
    expect(types.slice(3, 3 + actionCount)).toEqual(
      Array(actionCount).fill("action"),
    );
    expect(types).toEqual([
      "text",
      "text",
      "conversation",
      ...Array(actionCount).fill("action"),
      "done",
    ]);

    // Post-response storage scheduled with the completed turn.
    expect(vi.mocked(storeTurn)).toHaveBeenCalledTimes(1);
  });

  it("C2: invalid body shape returns 400 with a single invalid_request error", async () => {
    const res = await POST(chatRequest({ messages: "not-an-array" }));
    expect(res.status).toBe(400);
    const events = await readEvents(res);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "invalid_request" });
    expect(vi.mocked(checkRateLimit)).not.toHaveBeenCalled();
  });

  it("C3: body over 64KB returns 413 invalid_request", async () => {
    const big = JSON.stringify({
      messages: [{ role: "user", content: "x".repeat(70_000) }],
    });
    const res = await POST(chatRequest(big));
    expect(res.status).toBe(413);
    const events = await readEvents(res);
    expect(events[0]).toMatchObject({ type: "error", code: "invalid_request" });
  });

  it("C4: rate limited returns 429 with Retry-After and scope-specific message", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      ok: false,
      scope: "ip",
      retryAfterSeconds: 42,
    });
    const ipRes = await POST(
      chatRequest({ messages: [{ role: "user", content: "hi" }] }),
    );
    expect(ipRes.status).toBe(429);
    expect(ipRes.headers.get("Retry-After")).toBe("42");
    const ipEvents = await readEvents(ipRes);
    expect(ipEvents[0]).toMatchObject({ type: "error", code: "rate_limited" });
    expect((ipEvents[0] as { message: string }).message).toContain("42");

    vi.mocked(checkRateLimit).mockResolvedValue({
      ok: false,
      scope: "global",
      retryAfterSeconds: 100,
    });
    const globalRes = await POST(
      chatRequest({ messages: [{ role: "user", content: "hi" }] }),
    );
    expect(globalRes.status).toBe(429);
    expect(globalRes.headers.get("Retry-After")).toBe("100");
    const globalEvents = await readEvents(globalRes);
    expect(globalEvents).toHaveLength(1);
    expect(globalEvents[0]).toMatchObject({
      type: "error",
      code: "rate_limited",
    });
    expect((globalEvents[0] as { message: string }).message).toContain(
      "daily capacity",
    );
  });

  it("C5: mid-stream provider error emits typed error and stores nothing", async () => {
    vi.mocked(streamChatCompletion).mockReturnValue(
      stream(["partial"], new GatewayError("upstream 500", 500)),
    );
    const res = await POST(
      chatRequest({
        messages: [{ role: "user", content: "tell me about pricing" }],
        turnId: TURN_ID,
      }),
    );
    const events = await readEvents(res);

    // EXACTLY the partial delta then the typed error — no conversation
    // token, no action cards, no done after a provider failure.
    expect(events.map((e) => e.type)).toEqual(["text", "error"]);
    expect(events[0]).toEqual({ type: "text", delta: "partial" });
    expect(events[1]).toMatchObject({ code: "provider_error" });

    // storeTurn was never scheduled: the after-callback list is empty.
    expect(hoisted.afterCallbacks).toHaveLength(0);
    expect(vi.mocked(storeTurn)).not.toHaveBeenCalled();
  });

  it("C6: private mode emits no conversation event and stores nothing", async () => {
    vi.mocked(streamChatCompletion).mockReturnValue(stream(["answer"]));
    const res = await POST(
      chatRequest({
        messages: [{ role: "user", content: "hello" }],
        turnId: TURN_ID,
        private: true,
      }),
    );
    const events = await readEvents(res);
    const types = events.map((e) => e.type);

    // A private turn is otherwise a NORMAL success: text flows, no error,
    // done terminates — only the storage side effects disappear.
    expect(types[0]).toBe("text");
    expect(types).not.toContain("conversation");
    expect(types).not.toContain("error");
    expect(types[types.length - 1]).toBe("done");
    expect(vi.mocked(storeTurn)).not.toHaveBeenCalled();
  });

  it("C7: keyless in production returns 503; keyless otherwise runs the mock to done", async () => {
    vi.mocked(isGatewayConfigured).mockReturnValue(false);

    vi.stubEnv("VERCEL_ENV", "production");
    const prodRes = await POST(
      chatRequest({ messages: [{ role: "user", content: "hi" }] }),
    );
    expect(prodRes.status).toBe(503);
    const prodEvents = await readEvents(prodRes);
    expect(prodEvents).toHaveLength(1);
    const prodError = prodEvents[0] as { code: string; message: string };
    expect(prodError.code).toBe("provider_error");
    expect(prodError.message).toContain(knowledgeBase.verified_contacts.email);
    expect(prodError.message).toContain(knowledgeBase.verified_contacts.phone);

    // Non-production keyless = the dev/preview mock. It streams words behind
    // real 15ms timers, so run it under fake timers and advance them
    // deterministically instead of sleeping.
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.useFakeTimers();
    try {
      const mockRes = await POST(
        chatRequest({ messages: [{ role: "user", content: "hi" }] }),
      );
      expect(mockRes.status).toBe(200);
      const eventsPromise = readEvents(mockRes);
      await vi.runAllTimersAsync();
      const mockEvents = await eventsPromise;
      const mockTypes = mockEvents.map((e) => e.type);
      // The mock actually answers: text first, no error, done terminal.
      expect(mockTypes[0]).toBe("text");
      expect(mockTypes).not.toContain("error");
      expect(mockTypes[mockTypes.length - 1]).toBe("done");
    } finally {
      vi.useRealTimers();
    }
  });
});
