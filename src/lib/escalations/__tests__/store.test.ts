import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EscalationRecord } from "../types";
import {
  getEscalationStore,
  resetEscalationStoreForTests,
  StoreError,
} from "../store";

const record: EscalationRecord = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  question: "Do you help with strategy?",
  consent: true,
  consented_at: "2026-07-09T12:00:00.000Z",
  conversation_id: null,
};

const SUPABASE = {
  url: "https://project.supabase.co",
  key: "secret-service-key",
};

function stubSupabaseEnv() {
  vi.stubEnv("SUPABASE_URL", SUPABASE.url);
  vi.stubEnv("SUPABASE_SECRET_KEY", SUPABASE.key);
}

function stubNoSupabaseEnv() {
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
}

beforeEach(() => {
  resetEscalationStoreForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SupabaseRestStore (env present)", () => {
  beforeEach(() => stubSupabaseEnv());

  it("POSTs to the escalations endpoint with the right headers and body", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([{ id: "row-uuid-123" }]), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getEscalationStore().insert(record);
    expect(result).toEqual({ referenceId: "row-uuid-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${SUPABASE.url}/rest/v1/escalations`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe(SUPABASE.key);
    expect(headers.Authorization).toBe(`Bearer ${SUPABASE.key}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Prefer).toBe("return=representation");

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      name: record.name,
      email: record.email,
      question: record.question,
      consented_at: record.consented_at,
      conversation_id: null,
      status: "new",
    });
  });

  it("throws a StoreError on a non-2xx response, leaking neither key nor record", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("db is on fire", { status: 500 })),
    );

    let thrown: unknown;
    try {
      await getEscalationStore().insert(record);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(StoreError);
    const storeError = thrown as StoreError;
    expect(storeError.status).toBe(500);
    // The message carries the status but never the secret key or PII.
    expect(storeError.message).toContain("500");
    expect(storeError.message).not.toContain(SUPABASE.key);
    expect(storeError.message).not.toContain(record.email);
    expect(storeError.message).not.toContain(record.name);
  });

  it("throws a StoreError when the response has no usable id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{}]), { status: 201 })),
    );
    await expect(getEscalationStore().insert(record)).rejects.toBeInstanceOf(
      StoreError,
    );
  });
});

describe("MemoryStore (env absent)", () => {
  beforeEach(() => stubNoSupabaseEnv());

  it("assigns local-N reference ids and does not call fetch", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const store = getEscalationStore();
    expect(await store.insert(record)).toEqual({ referenceId: "local-1" });
    expect(await store.insert(record)).toEqual({ referenceId: "local-2" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns exactly once that persistence is not durable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = getEscalationStore();
    await store.insert(record);
    await store.insert(record);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
