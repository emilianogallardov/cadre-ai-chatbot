import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Durable public rate limiting (ADR-006).
 *
 * Two gates run before any model spend: a per-IP sliding window bounds a single
 * abuser, and a global daily fixed window is the actual budget guarantee for the
 * metered OpenRouter key. When the Upstash env vars are present we use durable
 * Redis counters (the only correct choice on serverless, where instances do not
 * share memory); otherwise we degrade to a permissive in-memory fallback for
 * local dev and warn once. This module never throws to the caller and never sees
 * message content — it is handed only an IP.
 */

export type RateLimitResult =
  | { ok: true }
  | { ok: false; scope: "ip" | "global"; retryAfterSeconds: number };

const IP_WINDOW_MS = 60_000; // "1 m"

interface Config {
  perIp: number;
  globalPerDay: number;
  escalationsPerIpPerDay: number;
  redisUrl?: string;
  redisToken?: string;
}

interface UpstashLimiters {
  ip: Ratelimit;
  global: Ratelimit;
}

// Config is read lazily on first check and cached, so tests can vi.stubEnv
// before the module observes the environment.
let cachedConfig: Config | null = null;
let cachedLimiters: UpstashLimiters | null = null;
// The escalation limiter is a distinct daily-per-IP gate on a different route
// (ADR-005 spam control), constructed separately from the chat limiters so the
// chat path's two-gate construction is unchanged.
let cachedEscalationLimiter: Ratelimit | null = null;

// In-memory fallback state (local dev only; not durable across instances).
const ipHits = new Map<string, number[]>();
let globalCounter: { date: string; count: number } | null = null;
// Per-IP daily escalation counters, keyed by IP -> { UTC date, count }.
const escalationHits = new Map<string, { date: string; count: number }>();
let warnedInMemory = false;

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfig(): Config {
  if (cachedConfig) return cachedConfig;
  cachedConfig = {
    perIp: readIntEnv("RATE_LIMIT_PER_IP_PER_MINUTE", 10),
    globalPerDay: readIntEnv("RATE_LIMIT_GLOBAL_PER_DAY", 400),
    escalationsPerIpPerDay: readIntEnv(
      "RATE_LIMIT_ESCALATIONS_PER_IP_PER_DAY",
      3,
    ),
    redisUrl: process.env.UPSTASH_REDIS_REST_URL || undefined,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || undefined,
  };
  return cachedConfig;
}

/** Seconds until a limiter reset timestamp (ms), clamped to at least 1. */
function retryAfterFromReset(resetMs: number): number {
  return Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const config = getConfig();
  if (config.redisUrl && config.redisToken) {
    return checkUpstash(ip, config);
  }
  return checkInMemory(ip, config);
}

function getUpstashLimiters(config: Config): UpstashLimiters {
  if (cachedLimiters) return cachedLimiters;
  const redis = new Redis({
    url: config.redisUrl!,
    token: config.redisToken!,
  });
  cachedLimiters = {
    ip: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.perIp, "1 m"),
      prefix: "rl:ip",
      analytics: false,
    }),
    global: new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(config.globalPerDay, "1 d"),
      prefix: "rl:global",
      analytics: false,
    }),
  };
  return cachedLimiters;
}

async function checkUpstash(
  ip: string,
  config: Config,
): Promise<RateLimitResult> {
  try {
    // Construction happens inside the guarded path: a malformed Upstash env
    // makes `new Redis(...)` / `new Ratelimit(...)` throw, and that must fail
    // closed like any other limiter failure rather than escape to the caller.
    const limiters = getUpstashLimiters(config);
    // Per-IP first: a single abuser is blocked without consuming the shared
    // global budget (requirement of ADR-006 — the global cap is the real
    // spend ceiling and must not be burned down by one client).
    const perIp = await limiters.ip.limit(ip);
    if (!perIp.success) {
      return {
        ok: false,
        scope: "ip",
        retryAfterSeconds: retryAfterFromReset(perIp.reset),
      };
    }
    const global = await limiters.global.limit("global");
    if (!global.success) {
      return {
        ok: false,
        scope: "global",
        retryAfterSeconds: retryAfterFromReset(global.reset),
      };
    }
    return { ok: true };
  } catch (error) {
    // FAIL CLOSED. This route spends a metered $5 key and the global daily cap
    // is the budget guarantee (ADR-006); a Redis outage must not silently
    // suspend that ceiling, so on any limiter error we deny. Users are not
    // stranded — the route renders this as a friendly typed 429 with verified
    // human-contact details. We log exactly once and never surface the error to
    // the caller.
    console.error("[ratelimit] Redis error; failing closed for this request", error);
    return { ok: false, scope: "global", retryAfterSeconds: 60 };
  }
}

/**
 * Per-IP daily cap on escalation submissions (ADR-005 spam control) — the
 * only limiter on the escalations route, which spends no model budget: a
 * single client may file only a few leads per day. Same durable-Redis-preferred,
 * fail-closed, in-memory-fallback semantics as checkRateLimit; it is handed only
 * an IP and never sees the submission.
 */
export async function checkEscalationLimit(
  ip: string,
): Promise<RateLimitResult> {
  const config = getConfig();
  if (config.redisUrl && config.redisToken) {
    return checkEscalationUpstash(ip, config);
  }
  return checkEscalationInMemory(ip, config);
}

function getEscalationLimiter(config: Config): Ratelimit {
  if (cachedEscalationLimiter) return cachedEscalationLimiter;
  const redis = new Redis({
    url: config.redisUrl!,
    token: config.redisToken!,
  });
  cachedEscalationLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(config.escalationsPerIpPerDay, "1 d"),
    prefix: "rl:esc",
    analytics: false,
  });
  return cachedEscalationLimiter;
}

async function checkEscalationUpstash(
  ip: string,
  config: Config,
): Promise<RateLimitResult> {
  try {
    const limiter = getEscalationLimiter(config);
    const result = await limiter.limit(ip);
    if (!result.success) {
      return {
        ok: false,
        scope: "ip",
        retryAfterSeconds: retryAfterFromReset(result.reset),
      };
    }
    return { ok: true };
  } catch (error) {
    // FAIL CLOSED, matching the chat limiter: a Redis outage must not open an
    // unbounded write path to the escalations table. The route renders this as a
    // friendly typed 429; we log once and never surface the error.
    console.error(
      "[ratelimit] Redis error on escalation limit; failing closed",
      error,
    );
    return { ok: false, scope: "ip", retryAfterSeconds: 60 };
  }
}

function checkEscalationInMemory(ip: string, config: Config): RateLimitResult {
  if (!warnedInMemory) {
    warnedInMemory = true;
    console.warn(
      "[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN not set; using in-memory " +
        "fallback (not durable across instances — production requires Upstash, ADR-006).",
    );
  }

  const now = Date.now();
  const today = utcDateKey(now);
  let entry = escalationHits.get(ip);
  if (!entry || entry.date !== today) {
    entry = { date: today, count: 0 };
    escalationHits.set(ip, entry);
  }
  if (entry.count >= config.escalationsPerIpPerDay) {
    return {
      ok: false,
      scope: "ip",
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }
  entry.count += 1;
  return { ok: true };
}

function utcDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function secondsUntilUtcMidnight(nowMs: number): number {
  const now = new Date(nowMs);
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((nextMidnight - nowMs) / 1000));
}

function checkInMemory(ip: string, config: Config): RateLimitResult {
  if (!warnedInMemory) {
    warnedInMemory = true;
    console.warn(
      "[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN not set; using in-memory " +
        "fallback (not durable across instances — production requires Upstash, ADR-006).",
    );
  }

  const now = Date.now();

  // Per-IP sliding window: prune expired timestamps, then decide.
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (recent.length >= config.perIp) {
    ipHits.set(ip, recent);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((recent[0] + IP_WINDOW_MS - now) / 1000),
    );
    return { ok: false, scope: "ip", retryAfterSeconds };
  }
  recent.push(now);
  ipHits.set(ip, recent);

  // Global daily counter keyed by the UTC date; per-IP was already consumed
  // above so the semantics match the Upstash path (per-IP first, then global).
  const today = utcDateKey(now);
  if (!globalCounter || globalCounter.date !== today) {
    globalCounter = { date: today, count: 0 };
  }
  if (globalCounter.count >= config.globalPerDay) {
    return {
      ok: false,
      scope: "global",
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }
  globalCounter.count += 1;
  return { ok: true };
}

/** Clears cached config, limiter instances, and in-memory state (tests only). */
export function resetRateLimiterForTests(): void {
  cachedConfig = null;
  cachedLimiters = null;
  cachedEscalationLimiter = null;
  ipHits.clear();
  globalCounter = null;
  escalationHits.clear();
  warnedInMemory = false;
}
