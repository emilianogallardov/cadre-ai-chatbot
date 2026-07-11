/**
 * GET /api/health — uptime/monitoring hook.
 *
 * Reports which subsystems are configured WITHOUT revealing any value, and
 * never touches the model or the database (a health probe must be free and
 * side-effect-less). `degraded` means "working with documented fallbacks",
 * mirroring the README's environment table — not an outage.
 */
export const runtime = "nodejs";

export async function GET() {
  const configured = {
    gateway: Boolean(process.env.OPENROUTER_API_KEY),
    storage: Boolean(
      process.env.SUPABASE_URL &&
        process.env.SUPABASE_SECRET_KEY &&
        process.env.CONVERSATION_SIGNING_SECRET,
    ),
    durableRateLimit: Boolean(
      process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN,
    ),
  };
  const healthy = configured.gateway && configured.storage;

  // Transparency call, made deliberately: the source is public and the
  // repo's own verification docs state the limiter posture, so these
  // booleans reveal nothing a reader of the repo doesn't have — and they
  // make the health semantics demonstrable. A closed-source deployment
  // should collapse this to aggregate status only. "Configured" means the
  // strings are present, not that credentials are currently valid.
  return Response.json(
    {
      status: healthy
        ? configured.durableRateLimit
          ? "ok"
          : "degraded"
        : "misconfigured",
      configured,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
