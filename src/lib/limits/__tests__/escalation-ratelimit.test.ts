import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Self-contained Upstash mock (separate file → separate module registry) so
// these escalation-limit tests never touch the chat-limiter test's mocks. The
// escalation limiter is the only gate constructed here, on prefix "rl:esc".
const mockState = vi.hoisted(() => ({
  esc: { success: true, reset: 0, throws: false },
  calls: [] as string[],
}));

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(function () {
    return { marker: "redis" };
  }),
}));

vi.mock("@upstash/ratelimit", () => {
  const Ratelimit = vi.fn(function (config: { prefix: string }) {
    return {
      prefix: config.prefix,
      limit: vi.fn(async (id: string) => {
        mockState.calls.push(id);
        if (mockState.esc.throws) throw new Error("redis unreachable");
        return {
          success: mockState.esc.success,
          reset: mockState.esc.reset,
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
import { checkEscalationLimit, resetRateLimiterForTests } from "../ratelimit";

function stubNoUpstashEnv() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
}

function stubUpstashEnv() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
}

beforeEach(() => {
  resetRateLimiterForTests();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mockState.esc = { success: true, reset: Date.now() + 30_000, throws: false };
  mockState.calls = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("checkEscalationLimit — in-memory fallback (no Upstash env)", () => {
  beforeEach(() => {
    stubNoUpstashEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("allows 3 submissions per IP per day and blocks the 4th", async () => {
    const ip = "1.2.3.4";
    expect(await checkEscalationLimit(ip)).toEqual({ ok: true });
    expect(await checkEscalationLimit(ip)).toEqual({ ok: true });
    expect(await checkEscalationLimit(ip)).toEqual({ ok: true });

    const blocked = await checkEscalationLimit(ip);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.scope).toBe("ip");
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });

  it("tracks different IPs independently", async () => {
    const a = "10.0.0.1";
    for (let i = 0; i < 3; i++) await checkEscalationLimit(a);
    expect((await checkEscalationLimit(a)).ok).toBe(false);

    // A different IP has its own daily budget.
    expect(await checkEscalationLimit("10.0.0.2")).toEqual({ ok: true });
  });

  it("respects the RATE_LIMIT_ESCALATIONS_PER_IP_PER_DAY override", async () => {
    vi.stubEnv("RATE_LIMIT_ESCALATIONS_PER_IP_PER_DAY", "1");
    const ip = "5.5.5.5";
    expect(await checkEscalationLimit(ip)).toEqual({ ok: true });
    const blocked = await checkEscalationLimit(ip);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.scope).toBe("ip");
  });
});

describe("checkEscalationLimit — Upstash backend", () => {
  beforeEach(() => stubUpstashEnv());

  it("uses a single fixed-window gate keyed by IP with prefix rl:esc", async () => {
    await checkEscalationLimit("9.9.9.9");
    expect(Ratelimit).toHaveBeenCalledTimes(1);
    const cfg = (Ratelimit as unknown as { mock: { calls: [{ prefix: string }][] } })
      .mock.calls[0][0];
    expect(cfg.prefix).toBe("rl:esc");
    expect(mockState.calls).toEqual(["9.9.9.9"]);
  });

  it("blocks with scope 'ip' when the limiter reports failure", async () => {
    mockState.esc = { success: false, reset: Date.now() + 5_000, throws: false };
    const result = await checkEscalationLimit("8.8.8.8");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.scope).toBe("ip");
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });

  it("fails closed (denies) when the limiter throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockState.esc = { success: true, reset: 0, throws: true };
    const result = await checkEscalationLimit("7.7.7.7");
    expect(result).toEqual({ ok: false, scope: "ip", retryAfterSeconds: 60 });
    expect(err).toHaveBeenCalledTimes(1);
  });
});

describe("resetRateLimiterForTests clears escalation state", () => {
  it("restores the full daily budget after a reset", async () => {
    stubNoUpstashEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ip = "3.3.3.3";
    for (let i = 0; i < 3; i++) await checkEscalationLimit(ip);
    expect((await checkEscalationLimit(ip)).ok).toBe(false);

    resetRateLimiterForTests();
    stubNoUpstashEnv();
    expect(await checkEscalationLimit(ip)).toEqual({ ok: true });
  });
});
