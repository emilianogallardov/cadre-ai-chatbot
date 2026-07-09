import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shared, hoisted mock state so the vi.mock factories (hoisted to the top of the
// module) can reference it. Each test drives the Upstash limiter's behaviour by
// mutating these fields.
const mockState = vi.hoisted(() => ({
  limitCalls: [] as Array<{ prefix: string; id: string }>,
  ip: { success: true, reset: 0, throws: false },
  global: { success: true, reset: 0, throws: false },
}));

vi.mock("@upstash/redis", () => ({
  // Regular function (not arrow) so it is usable with `new Redis(...)`.
  Redis: vi.fn(function () {
    return { marker: "redis" };
  }),
}));

vi.mock("@upstash/ratelimit", () => {
  const Ratelimit = vi.fn(function (config: { prefix: string }) {
    return {
      prefix: config.prefix,
      limit: vi.fn(async (id: string) => {
        const which =
          config.prefix === "rl:ip" ? mockState.ip : mockState.global;
        mockState.limitCalls.push({ prefix: config.prefix, id });
        if (which.throws) throw new Error("redis unreachable");
        return {
          success: which.success,
          reset: which.reset,
          limit: 0,
          remaining: 0,
          pending: Promise.resolve(),
        };
      }),
    };
  });
  (Ratelimit as unknown as { slidingWindow: unknown }).slidingWindow = vi.fn(
    () => "sliding",
  );
  (Ratelimit as unknown as { fixedWindow: unknown }).fixedWindow = vi.fn(
    () => "fixed",
  );
  return { Ratelimit };
});

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { checkRateLimit, resetRateLimiterForTests } from "../ratelimit";

const UPSTASH_ENV = {
  url: "https://example.upstash.io",
  token: "test-token",
};

function stubUpstashEnv() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", UPSTASH_ENV.url);
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", UPSTASH_ENV.token);
}

function stubNoUpstashEnv() {
  // Empty string is treated as absent by the module (`|| undefined`), so the
  // in-memory fallback is selected regardless of the host machine's env.
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
}

beforeEach(() => {
  resetRateLimiterForTests();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mockState.limitCalls = [];
  mockState.ip = { success: true, reset: Date.now() + 30_000, throws: false };
  mockState.global = {
    success: true,
    reset: Date.now() + 30_000,
    throws: false,
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  // Note: no vi.restoreAllMocks() — it would unwrap the vi.mock'd modules and
  // break `new Redis()` in later tests. Console spies are re-created per test.
});

describe("in-memory fallback (no Upstash env)", () => {
  beforeEach(() => stubNoUpstashEnv());

  it("blocks request N+1 within the per-IP window and allows again after 61s", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RATE_LIMIT_PER_IP_PER_MINUTE", "10");
    const ip = "1.1.1.1";

    for (let i = 0; i < 10; i++) {
      expect(await checkRateLimit(ip)).toEqual({ ok: true });
    }
    const blocked = await checkRateLimit(ip);
    expect(blocked).toEqual({
      ok: false,
      scope: "ip",
      retryAfterSeconds: expect.any(Number),
    });
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    vi.advanceTimersByTime(61_000);
    expect(await checkRateLimit(ip)).toEqual({ ok: true });
  });

  it("tracks different IPs independently", async () => {
    vi.stubEnv("RATE_LIMIT_PER_IP_PER_MINUTE", "2");
    expect(await checkRateLimit("10.0.0.1")).toEqual({ ok: true });
    expect(await checkRateLimit("10.0.0.1")).toEqual({ ok: true });
    expect((await checkRateLimit("10.0.0.1")).ok).toBe(false);

    // A different IP is unaffected by the first IP's exhaustion.
    expect(await checkRateLimit("10.0.0.2")).toEqual({ ok: true });
  });

  it("respects RATE_LIMIT_PER_IP_PER_MINUTE override (3rd call blocked at cap 2)", async () => {
    vi.stubEnv("RATE_LIMIT_PER_IP_PER_MINUTE", "2");
    const ip = "2.2.2.2";
    expect(await checkRateLimit(ip)).toEqual({ ok: true });
    expect(await checkRateLimit(ip)).toEqual({ ok: true });
    const third = await checkRateLimit(ip);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.scope).toBe("ip");
  });

  it("global daily cap blocks ALL IPs with scope 'global' once exhausted", async () => {
    // Large per-IP cap so per-IP never fires; small global cap so it does.
    vi.stubEnv("RATE_LIMIT_PER_IP_PER_MINUTE", "1000");
    vi.stubEnv("RATE_LIMIT_GLOBAL_PER_DAY", "3");

    expect(await checkRateLimit("a")).toEqual({ ok: true });
    expect(await checkRateLimit("b")).toEqual({ ok: true });
    expect(await checkRateLimit("c")).toEqual({ ok: true });

    // Budget exhausted: a brand-new IP is blocked globally, not per-IP.
    const blocked = await checkRateLimit("fresh-ip");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.scope).toBe("global");
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });

  it("warns exactly once about the non-durable fallback", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await checkRateLimit("w.w.w.w");
    await checkRateLimit("w.w.w.w");
    await checkRateLimit("x.x.x.x");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not construct the Upstash limiter when env vars are absent", async () => {
    await checkRateLimit("no-redis");
    expect(Ratelimit).not.toHaveBeenCalled();
    expect(Redis).not.toHaveBeenCalled();
  });
});

describe("Upstash backend (both env vars present)", () => {
  beforeEach(() => stubUpstashEnv());

  it("constructs the limiter (Redis + two Ratelimit gates) only with both env vars", async () => {
    await checkRateLimit("9.9.9.9");
    expect(Redis).toHaveBeenCalledTimes(1);
    expect(Ratelimit).toHaveBeenCalledTimes(2);
    const prefixes = (Ratelimit as unknown as { mock: { calls: [{ prefix: string }][] } }).mock.calls.map(
      ([cfg]) => cfg.prefix,
    );
    expect(prefixes).toEqual(["rl:ip", "rl:global"]);
  });

  it("checks per-IP before global", async () => {
    await checkRateLimit("8.8.8.8");
    expect(mockState.limitCalls.map((c) => c.prefix)).toEqual([
      "rl:ip",
      "rl:global",
    ]);
    expect(mockState.limitCalls[0].id).toBe("8.8.8.8");
    expect(mockState.limitCalls[1].id).toBe("global");
  });

  it("does not consume the global budget when per-IP already blocks", async () => {
    mockState.ip = { success: false, reset: Date.now() + 5_000, throws: false };
    const result = await checkRateLimit("7.7.7.7");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.scope).toBe("ip");
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
    // Only the per-IP limiter was consulted; the global counter is untouched.
    expect(mockState.limitCalls.map((c) => c.prefix)).toEqual(["rl:ip"]);
  });

  it("returns scope 'global' when the global cap is reached", async () => {
    mockState.global = {
      success: false,
      reset: Date.now() + 5_000,
      throws: false,
    };
    const result = await checkRateLimit("6.6.6.6");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.scope).toBe("global");
    expect(mockState.limitCalls.map((c) => c.prefix)).toEqual([
      "rl:ip",
      "rl:global",
    ]);
  });

  it("fails open (allows the request) when a limit() call throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockState.ip = { success: true, reset: 0, throws: true };
    const result = await checkRateLimit("5.5.5.5");
    expect(result).toEqual({ ok: true });
    expect(err).toHaveBeenCalledTimes(1);
  });
});
