import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../health/route";

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

function stubAll() {
  vi.stubEnv("OPENROUTER_API_KEY", "k");
  vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "s");
  vi.stubEnv("CONVERSATION_SIGNING_SECRET", "c");
}

describe("GET /api/health", () => {
  it("H1: fully configured with durable limiter → 200 ok", async () => {
    stubAll();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://r.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.configured.durableRateLimit).toBe(true);
  });

  it("H2: configured without Upstash → 200 degraded (documented fallback, not an outage)", async () => {
    stubAll();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "degraded" });
  });

  it("H3: missing key → 503 misconfigured; no secret values ever appear", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "super-secret-value");
    vi.stubEnv("CONVERSATION_SIGNING_SECRET", "c");
    const res = await GET();
    expect(res.status).toBe(503);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("misconfigured");
    expect(text).not.toContain("super-secret-value");
  });
});
