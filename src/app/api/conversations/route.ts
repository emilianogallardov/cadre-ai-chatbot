import { NextRequest } from "next/server";
import { verifyConversationToken } from "@/lib/conversations/token";
import { deleteConversation } from "@/lib/conversations/store";
import { checkDeleteLimit } from "@/lib/limits/ratelimit";
import { readJsonBounded } from "@/lib/http/body";

export const runtime = "nodejs";

/** A token is a uuid + dot + 64 hex chars (~101 bytes); 4KB of JSON is ample. */
const MAX_BODY_BYTES = 4096;

/**
 * DELETE /api/conversations — the "Delete this chat" control (ADR-008 #7).
 *
 * The signed token is the authority for WHICH conversation may be deleted:
 * only the browser holding the session's token can name one. An invalid token
 * is a 400 with no detail (never an oracle for probing ids); a verified
 * delete cascades to the conversation's messages. The body read is
 * byte-bounded, and a per-IP daily cap bounds Supabase request volume —
 * checked after verification so only well-formed, authorized calls consume it.
 */
export async function DELETE(req: NextRequest) {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return json({ ok: false }, 415);
  }

  let token: unknown;
  try {
    ({ token } = (await readJsonBounded(req, MAX_BODY_BYTES)) as {
      token?: unknown;
    });
  } catch {
    // Oversized and malformed bodies answer identically to a bad token.
    return json({ ok: false }, 400);
  }

  const conversationId = verifyConversationToken(token);
  if (!conversationId) return json({ ok: false }, 400);

  const limit = await checkDeleteLimit(clientIp(req));
  if (!limit.ok) {
    return Response.json(
      { ok: false },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const ok = await deleteConversation(conversationId);
  return json({ ok }, ok ? 200 : 502);
}

function json(body: { ok: boolean }, status: number) {
  return Response.json(body, { status });
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
