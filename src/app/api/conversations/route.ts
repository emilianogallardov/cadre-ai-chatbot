import { NextRequest } from "next/server";
import { verifyConversationToken } from "@/lib/conversations/token";
import { deleteConversation } from "@/lib/conversations/store";

export const runtime = "nodejs";

/**
 * DELETE /api/conversations — the "Delete this chat" control (ADR-008 #7).
 *
 * The signed token is the authority: only the browser holding the session's
 * token can name a conversation, so no rate limiter or identity check is
 * needed beyond signature verification. An invalid token is a 400 with no
 * detail (never an oracle for probing ids); a verified delete cascades to the
 * conversation's messages.
 */
export async function DELETE(req: NextRequest) {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return json({ ok: false }, 415);
  }

  let token: unknown;
  try {
    ({ token } = (await req.json()) as { token?: unknown });
  } catch {
    return json({ ok: false }, 400);
  }

  const conversationId = verifyConversationToken(token);
  if (!conversationId) return json({ ok: false }, 400);

  const ok = await deleteConversation(conversationId);
  return json({ ok }, ok ? 200 : 502);
}

function json(body: { ok: boolean }, status: number) {
  return Response.json(body, { status });
}
