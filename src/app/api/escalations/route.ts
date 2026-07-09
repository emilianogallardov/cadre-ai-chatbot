import { NextRequest } from "next/server";
import { EscalationResult } from "@/lib/escalations/types";
import { validateEscalation, ValidationError } from "@/lib/escalations/validate";
import { getEscalationStore, StoreError } from "@/lib/escalations/store";
import { checkEscalationLimit } from "@/lib/limits/ratelimit";
import { knowledgeBase } from "@/lib/prompt/knowledge";

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
 * 1. header checks (JSON content type, bounded content length),
 * 2. the per-IP daily escalation cap — checked BEFORE parsing the body, and
 *    the ONLY limiter on this route: the chat limiter's global counter guards
 *    model spend (ADR-006) and this route spends no model, so escalation
 *    traffic must not be able to exhaust it and block /api/chat,
 * 3. shape validation of the minimal fields (400 on failure),
 * 4. the validated insert, with the server stamping the consent timestamp.
 * If the durable store fails, the user is always handed the verified
 * direct-contact fallback (ADR-005) rather than a raw error.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (!contentType.includes("application/json") || contentLength > MAX_BODY_BYTES) {
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
  try {
    const body = await req.json();
    input = validateEscalation(body);
  } catch (err) {
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
  // (Malformed spam is bounded by the content-length gate above; parsing a
  // <=16KB body is trivial.)
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

  try {
    // The server records the consent timestamp; it is never client-supplied.
    const store = getEscalationStore();
    const { referenceId } = await store.insert({
      ...input,
      consented_at: new Date().toISOString(),
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
