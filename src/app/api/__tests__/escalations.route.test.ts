import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { NextRequest } from "next/server";
import { mintConversationToken } from "@/lib/conversations/token";
import {
  getEscalationStore,
  StoreError,
  type EscalationStore,
} from "@/lib/escalations/store";
import { checkEscalationLimit } from "@/lib/limits/ratelimit";
import { linkConversation } from "@/lib/conversations/store";
import { knowledgeBase } from "@/lib/prompt/knowledge";
import { POST } from "../escalations/route";

// Partial mock keeps StoreError the real class (route uses `instanceof`) while
// letting getEscalationStore return a controllable fake.
vi.mock("@/lib/escalations/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/escalations/store")>();
  return {
    ...actual,
    getEscalationStore: vi.fn(),
  };
});

// Partial mocks preserve each module's real export shape so signature drift
// in unmocked exports stays visible to the type checker.
vi.mock("@/lib/limits/ratelimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/limits/ratelimit")>();
  return {
    ...actual,
    checkEscalationLimit: vi.fn(),
  };
});

// Only the PostgREST-touching link is mocked; the token module stays real.
vi.mock("@/lib/conversations/store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/conversations/store")>();
  return {
    ...actual,
    linkConversation: vi.fn(),
  };
});

const SIGNING_SECRET = "test-signing-secret";

const VALID_LEAD = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  question: "Can you help with an AI roadmap?",
  consent: true,
};

let insertMock: Mock<EscalationStore["insert"]>;

function escRequest(
  body: unknown,
  contentType = "application/json",
): NextRequest {
  return new NextRequest("http://localhost/api/escalations", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.stubEnv("CONVERSATION_SIGNING_SECRET", SIGNING_SECRET);
  insertMock = vi.fn<EscalationStore["insert"]>(async () => ({
    referenceId: "ref-123",
  }));
  vi.mocked(getEscalationStore).mockReturnValue({ insert: insertMock });
  vi.mocked(checkEscalationLimit).mockResolvedValue({ ok: true });
  vi.mocked(linkConversation).mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/escalations", () => {
  it("E1: non-JSON content-type returns 400", async () => {
    const res = await POST(escRequest("hello", "text/plain"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(vi.mocked(checkEscalationLimit)).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("E2: body over 16KB returns 413", async () => {
    const big = JSON.stringify({ ...VALID_LEAD, question: "x".repeat(17_000) });
    const res = await POST(escRequest(big));
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("E3: invalid email returns 400 before the escalation cap is consumed", async () => {
    const res = await POST(
      escRequest({ ...VALID_LEAD, email: "not-an-email" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: "invalid",
    });
    // Validation runs before the cap: a typo must not consume it.
    expect(vi.mocked(checkEscalationLimit)).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("E4: rate limited returns 429 with no insert", async () => {
    vi.mocked(checkEscalationLimit).mockResolvedValue({
      ok: false,
      scope: "ip",
      retryAfterSeconds: 60,
    });
    const res = await POST(escRequest(VALID_LEAD));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: "rate_limited",
    });
    expect(vi.mocked(linkConversation)).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("E5: valid token links the conversation before inserting the lead", async () => {
    const token = mintConversationToken();
    const uuid = token.slice(0, token.indexOf("."));

    const res = await POST(
      escRequest({ ...VALID_LEAD, conversationToken: token }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      referenceId: "ref-123",
    });

    expect(vi.mocked(linkConversation)).toHaveBeenCalledWith(uuid);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      conversation_id: uuid,
    });
    // linkConversation runs strictly before the insert (FK-before-write).
    expect(
      vi.mocked(linkConversation).mock.invocationCallOrder[0],
    ).toBeLessThan(insertMock.mock.invocationCallOrder[0]);
  });

  it("E6: invalid token inserts with conversation_id null and still succeeds", async () => {
    const res = await POST(
      escRequest({ ...VALID_LEAD, conversationToken: "bad-token" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });

    // Short-circuit: an unverifiable token never even calls linkConversation.
    expect(vi.mocked(linkConversation)).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      conversation_id: null,
    });
  });

  it("E7: StoreError yields the direct-contact fallback, not a raw 500", async () => {
    insertMock.mockRejectedValue(new StoreError(500, "insert rejected"));
    const res = await POST(escRequest(VALID_LEAD));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("store_failed");
    expect(body.message).toContain(knowledgeBase.verified_contacts.email);
    expect(body.message).toContain(knowledgeBase.verified_contacts.phone);
  });
});
