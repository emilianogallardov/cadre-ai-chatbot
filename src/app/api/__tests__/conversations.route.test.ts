import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { mintConversationToken } from "@/lib/conversations/token";
import { deleteConversation } from "@/lib/conversations/store";
import { checkDeleteLimit } from "@/lib/limits/ratelimit";
import { DELETE } from "../conversations/route";

// Partial mock preserves the module's real export shape; only the seam the
// route consumes is overridden.
vi.mock("@/lib/limits/ratelimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/limits/ratelimit")>();
  return {
    ...actual,
    checkDeleteLimit: vi.fn(),
  };
});

// Only the PostgREST-touching delete is mocked (partial mock keeps the rest
// of the module's real exports so shape drift stays visible); the token
// module is real and driven through a stubbed signing secret so tests mint
// genuine signed tokens.
vi.mock("@/lib/conversations/store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/conversations/store")>();
  return {
    ...actual,
    deleteConversation: vi.fn(),
  };
});

const SIGNING_SECRET = "test-signing-secret";

function deleteRequest(
  body: string,
  contentType = "application/json",
): NextRequest {
  return new NextRequest("http://localhost/api/conversations", {
    method: "DELETE",
    headers: { "content-type": contentType },
    body,
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.stubEnv("CONVERSATION_SIGNING_SECRET", SIGNING_SECRET);
  vi.mocked(deleteConversation).mockResolvedValue(true);
  vi.mocked(checkDeleteLimit).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DELETE /api/conversations", () => {
  it("V1: non-JSON content-type returns 415", async () => {
    const res = await DELETE(deleteRequest("{}", "text/plain"));
    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toEqual({ ok: false });
    expect(vi.mocked(deleteConversation)).not.toHaveBeenCalled();
  });

  it("V2: malformed JSON returns 400", async () => {
    const res = await DELETE(deleteRequest("{not-json"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false });
    expect(vi.mocked(deleteConversation)).not.toHaveBeenCalled();
  });

  it("V3: forged-signature and malformed tokens return 400 with the same shape as malformed input", async () => {
    const malformed = await DELETE(deleteRequest("{not-json"));
    const malformedBody = await malformed.json();

    // A syntactically valid `uuid.64-hex` token whose HMAC is wrong by one
    // character: this must fail at signature verification, not shape checks.
    const genuine = mintConversationToken();
    const lastChar = genuine.slice(-1);
    const forged =
      genuine.slice(0, -1) + (lastChar === "0" ? "1" : "0");
    expect(forged).not.toBe(genuine);

    for (const token of [forged, "not-a-valid-token"]) {
      const res = await DELETE(deleteRequest(JSON.stringify({ token })));
      expect(res.status).toBe(400);
      // No verification oracle: identical status and body to malformed input.
      await expect(res.json()).resolves.toEqual(malformedBody);
    }
    expect(vi.mocked(deleteConversation)).not.toHaveBeenCalled();
  });

  it("V4: valid token deletes the embedded UUID and returns ok:true 200", async () => {
    const token = mintConversationToken();
    const uuid = token.slice(0, token.indexOf("."));

    const res = await DELETE(deleteRequest(JSON.stringify({ token })));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(vi.mocked(deleteConversation)).toHaveBeenCalledWith(uuid);
  });

  it("V5: store failure returns 502 ok:false", async () => {
    vi.mocked(deleteConversation).mockResolvedValue(false);
    const token = mintConversationToken();

    const res = await DELETE(deleteRequest(JSON.stringify({ token })));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ ok: false });
  });

  it("V6: per-IP delete cap returns 429 with Retry-After and no store call", async () => {
    vi.mocked(checkDeleteLimit).mockResolvedValue({
      ok: false,
      scope: "ip",
      retryAfterSeconds: 3600,
    });
    const token = mintConversationToken();

    const res = await DELETE(deleteRequest(JSON.stringify({ token })));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(vi.mocked(deleteConversation)).not.toHaveBeenCalled();
  });

  it("V7: oversized body answers like malformed input (400) and never verifies", async () => {
    const big = JSON.stringify({ token: "x".repeat(8192) });
    const res = await DELETE(deleteRequest(big));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false });
    expect(vi.mocked(checkDeleteLimit)).not.toHaveBeenCalled();
    expect(vi.mocked(deleteConversation)).not.toHaveBeenCalled();
  });
});
