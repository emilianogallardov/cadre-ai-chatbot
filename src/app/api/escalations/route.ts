import { NextRequest } from "next/server";
import { EscalationResult } from "@/lib/escalations/types";
import { validateEscalation, ValidationError } from "@/lib/escalations/validate";
import { getEscalationStore, StoreError } from "@/lib/escalations/store";
import { checkEscalationLimit } from "@/lib/limits/ratelimit";
import { knowledgeBase } from "@/lib/prompt/knowledge";
import { verifyConversationToken } from "@/lib/conversations/token";
import { linkConversation } from "@/lib/conversations/store";
import { BodyTooLargeError, readJsonBounded } from "@/lib/http/body";

export const runtime = "nodejs";

/**
 * Generous ceiling over the largest valid payload (100 + 254 + 2000 chars of
 * fields plus JSON overhead); anything bigger is rejected before parsing.
 */
const MAX_BODY_BYTES = 16_384;

/**
 * POST /api/escalations — persist one minimal support lead (ADR-005).
 *
 * Cheap gates run in strict order before the single write:
 * 1. content-type check, then a byte-bounded body read + shape validation of
 *    the minimal fields (400/413 on failure),
 * 2. the per-IP daily escalation cap — checked AFTER validation so only
 *    well-formed submissions consume it, and the ONLY limiter on this route:
 *    the chat limiter's global counter guards model spend (ADR-006) and this
 *    route spends no model, so escalation traffic must not be able to
 *    exhaust it and block /api/chat,
 * 3. the validated insert, with the server stamping the consent timestamp.
 * If the durable store fails, the user is always handed the verified
 * direct-contact fallback (ADR-005) rather than a raw error.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonResult(
      {
        ok: false,
        code: "invalid",
        message: "Request must be JSON with name, email, question, and consent.",
      },
      400,
    );
  }

  let input;
  let conversationToken: unknown;
  try {
    // Size is enforced on the actual bytes read, not the Content-Length
    // header, which is a client claim (absent entirely on chunked encoding).
    const body = await readJsonBounded(req, MAX_BODY_BYTES);
    conversationToken = (body as { conversationToken?: unknown })
      ?.conversationToken;
    input = validateEscalation(body);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return jsonResult(
        { ok: false, code: "invalid", message: "Request body is too large." },
        413,
      );
    }
    return jsonResult(
      {
        ok: false,
        code: "invalid",
        message:
          err instanceof ValidationError
            ? err.message
            : "Request body must be JSON with name, email, question, and consent.",
      },
      400,
    );
  }

  // The cap runs after validation so it is consumed only by well-formed
  // submissions — three typos must not lock a legitimate user out for a day.
  // (Malformed spam is bounded by the byte cap above; parsing a <=16KB body
  // is trivial.)
  const escalation = await checkEscalationLimit(clientIp(req));
  if (!escalation.ok) {
    const contacts = knowledgeBase.verified_contacts;
    return jsonResult(
      {
        ok: false,
        code: "rate_limited",
        message:
          "We've received several requests from you recently. Please try " +
          `again later, or reach Cadre directly at ${contacts.email} or ` +
          `${contacts.phone}.`,
      },
      429,
      { "Retry-After": String(escalation.retryAfterSeconds) },
    );
  }

  // Conversation link (ADR-008): only a validly signed token names a
  // conversation, and the row is upserted BEFORE the lead insert so the FK can
  // never race the post-stream transcript write. A failed upsert degrades to an
  // unlinked lead — the link is context, never worth losing the lead over.
  const conversationId = verifyConversationToken(conversationToken);
  const linked =
    conversationId !== null && (await linkConversation(conversationId));

  try {
    // The server records the consent timestamp; it is never client-supplied.
    const store = getEscalationStore();
    const { referenceId } = await store.insert({
      ...input,
      consented_at: new Date().toISOString(),
      conversation_id: linked ? conversationId : null,
    });
    return jsonResult({ ok: true, referenceId }, 200);
  } catch (err) {
    if (err instanceof StoreError) {
      const contacts = knowledgeBase.verified_contacts;
      return jsonResult(
        {
          ok: false,
          code: "store_failed",
          message:
            "We couldn't save your request just now. Please reach Cadre " +
            `directly at ${contacts.email} or ${contacts.phone} and we'll ` +
            "follow up.",
        },
        502,
      );
    }
    throw err;
  }
}

/**
 * Client IP for the limiter key. Same trust model as the chat route: on Vercel
 * these headers are set by the platform proxy (client-supplied values are
 * stripped), and anything unidentifiable shares one "unknown" bucket.
 */
function clientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function jsonResult(
  result: EscalationResult,
  status: number,
  headers?: Record<string, string>,
) {
  return new Response(JSON.stringify(result), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
