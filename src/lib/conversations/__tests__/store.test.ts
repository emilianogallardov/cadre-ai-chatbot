import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteConversation,
  linkConversation,
  storeTurn,
} from "../store";

const SUPABASE = {
  url: "https://project.supabase.co",
  key: "secret-service-key",
};

const CONVERSATION_ID = "11111111-1111-1111-1111-111111111111";
const TURN_ID = "22222222-2222-2222-2222-222222222222";

function stubStorageEnv() {
  vi.stubEnv("CONVERSATION_SIGNING_SECRET", "signing-secret");
  vi.stubEnv("SUPABASE_URL", SUPABASE.url);
  vi.stubEnv("SUPABASE_SECRET_KEY", SUPABASE.key);
}

function stubNoStorageEnv() {
  vi.stubEnv("CONVERSATION_SIGNING_SECRET", "");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
}

function ok(status = 201) {
  return new Response(null, { status });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("storeTurn (configured)", () => {
  beforeEach(() => stubStorageEnv());

  it("upserts the conversation then inserts both messages with dedup headers", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);

    await storeTurn({
      conversationId: CONVERSATION_ID,
      turnId: TURN_ID,
      userText: "hi",
      assistantText: "hello",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [convUrl, convInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(convUrl).toBe(`${SUPABASE.url}/rest/v1/conversations`);
    expect(convInit.method).toBe("POST");
    expect(convInit.redirect).toBe("error");
    const convHeaders = convInit.headers as Record<string, string>;
    expect(convHeaders.apikey).toBe(SUPABASE.key);
    expect(convHeaders.Authorization).toBe(`Bearer ${SUPABASE.key}`);
    expect(convHeaders.Prefer).toBe("resolution=merge-duplicates");
    const convBody = JSON.parse(convInit.body as string);
    expect(convBody.id).toBe(CONVERSATION_ID);
    expect(typeof convBody.last_message_at).toBe("string");

    const [msgUrl, msgInit] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(msgUrl).toBe(`${SUPABASE.url}/rest/v1/messages`);
    expect(msgInit.method).toBe("POST");
    expect(msgInit.redirect).toBe("error");
    const msgHeaders = msgInit.headers as Record<string, string>;
    expect(msgHeaders.Prefer).toBe("resolution=ignore-duplicates");
    const rows = JSON.parse(msgInit.body as string);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      conversation_id: CONVERSATION_ID,
      turn_id: TURN_ID,
      role: "user",
      content: "hi",
    });
    expect(rows[1]).toMatchObject({
      conversation_id: CONVERSATION_ID,
      turn_id: TURN_ID,
      role: "assistant",
      content: "hello",
    });
  });

  it("truncates stored content to 4000 chars on both roles", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);

    await storeTurn({
      conversationId: CONVERSATION_ID,
      turnId: TURN_ID,
      userText: "u".repeat(5000),
      assistantText: "a".repeat(5000),
    });

    const [, msgInit] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    const rows = JSON.parse(msgInit.body as string);
    expect(rows[0].content).toHaveLength(4000);
    expect(rows[1].content).toHaveLength(4000);
  });

  it("does not insert messages when the conversation upsert fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await storeTurn({
      conversationId: CONVERSATION_ID,
      turnId: TURN_ID,
      userText: "hi",
      assistantText: "hello",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never throws when the message insert returns 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      storeTurn({
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        userText: "hi",
        assistantText: "hello",
      }),
    ).resolves.toBeUndefined();
  });

  it("never throws when fetch rejects (network error)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(
      storeTurn({
        conversationId: CONVERSATION_ID,
        turnId: TURN_ID,
        userText: "hi",
        assistantText: "hello",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("storeTurn (unconfigured)", () => {
  beforeEach(() => stubNoStorageEnv());

  it("is a no-op and never calls fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await storeTurn({
      conversationId: CONVERSATION_ID,
      turnId: TURN_ID,
      userText: "hi",
      assistantText: "hello",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("linkConversation", () => {
  it("upserts the conversation and returns true on 2xx", async () => {
    stubStorageEnv();
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);

    const result = await linkConversation(CONVERSATION_ID);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${SUPABASE.url}/rest/v1/conversations`);
    expect((init.headers as Record<string, string>).Prefer).toBe(
      "resolution=merge-duplicates",
    );
  });

  it("returns false on a non-2xx response without throwing", async () => {
    stubStorageEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    await expect(linkConversation(CONVERSATION_ID)).resolves.toBe(false);
  });

  it("returns false on a network error without throwing", async () => {
    stubStorageEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(linkConversation(CONVERSATION_ID)).resolves.toBe(false);
  });

  it("returns false and does not call fetch when unconfigured", async () => {
    stubNoStorageEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(linkConversation(CONVERSATION_ID)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("deleteConversation", () => {
  it("DELETEs by id filter and returns true on 2xx", async () => {
    stubStorageEnv();
    const fetchMock = vi.fn(async () => ok(204));
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteConversation(CONVERSATION_ID);
    expect(result).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `${SUPABASE.url}/rest/v1/conversations?id=eq.${CONVERSATION_ID}`,
    );
    expect(init.method).toBe("DELETE");
    expect(init.redirect).toBe("error");
  });

  it("returns false on a non-2xx response without throwing", async () => {
    stubStorageEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(deleteConversation(CONVERSATION_ID)).resolves.toBe(false);
  });

  it("returns false on a network error without throwing", async () => {
    stubStorageEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(deleteConversation(CONVERSATION_ID)).resolves.toBe(false);
  });

  it("returns false and does not call fetch when unconfigured", async () => {
    stubNoStorageEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteConversation(CONVERSATION_ID)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
