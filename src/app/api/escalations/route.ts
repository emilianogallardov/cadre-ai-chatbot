import { NextRequest } from "next/server";
import { EscalationResult } from "@/lib/escalations/types";
import { validateEscalation, ValidationError } from "@/lib/escalations/validate";
import { getEscalationStore, StoreError } from "@/lib/escalations/store";
import { checkEscalationLimit, checkRateLimit } from "@/lib/limits/ratelimit";
import { knowledgeBase } from "@/lib/prompt/knowledge";

export const runtime = "nodejs";

/**
 * POST /api/escalations — persist one minimal support lead (ADR-005).
 *
 * Cheap gates run in strict order before the single write:
 * 1. shape validation of the minimal fields (400 on failure),
 * 2. the shared per-IP/global limiter AND a per-IP daily escalation cap
 *    (429 on either), so this write path cannot be used to spam the table,
 * 3. the validated insert, with the server stamping the consent timestamp.
 * If the durable store fails, the user is always handed the verified
 * direct-contact fallback (ADR-005) rather than a raw error.
 */
export async function POST(req: NextRequest) {
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

  const ip = clientIp(req);
  // Both gates: the shared abuse limiter (ADR-006) and the per-IP daily
  // escalation cap (ADR-005). Either one blocking is a 429 with Retry-After.
  const [general, escalation] = await Promise.all([
    checkRateLimit(ip),
    checkEscalationLimit(ip),
  ]);
  const blocked = !general.ok ? general : !escalation.ok ? escalation : null;
  if (blocked) {
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
      { "Retry-After": String(blocked.retryAfterSeconds) },
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
