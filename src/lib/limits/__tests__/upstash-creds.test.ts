import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveUpstashCreds } from "../ratelimit";

const KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_KV_REST_API_URL",
  "UPSTASH_REDIS_KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;

function clear() {
  for (const k of KEYS) vi.stubEnv(k, "");
}

afterEach(() => vi.unstubAllEnvs());

describe("resolveUpstashCreds", () => {
  it("reads the canonical names", () => {
    clear();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://canonical.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "canon-token");
    expect(resolveUpstashCreds()).toEqual({
      url: "https://canonical.upstash.io",
      token: "canon-token",
    });
  });

  it("falls back to the Vercel Upstash integration's UPSTASH_REDIS_KV_* names", () => {
    clear();
    vi.stubEnv("UPSTASH_REDIS_KV_REST_API_URL", "https://kv.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_KV_REST_API_TOKEN", "kv-token");
    expect(resolveUpstashCreds()).toEqual({
      url: "https://kv.upstash.io",
      token: "kv-token",
    });
  });

  it("falls back to the integration's bare KV_REST_API_* names", () => {
    clear();
    vi.stubEnv("KV_REST_API_URL", "https://bare.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "bare-token");
    expect(resolveUpstashCreds()).toEqual({
      url: "https://bare.upstash.io",
      token: "bare-token",
    });
  });

  it("prefers canonical over the integration names when both are set", () => {
    clear();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://canonical.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "canon-token");
    vi.stubEnv("UPSTASH_REDIS_KV_REST_API_URL", "https://kv.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_KV_REST_API_TOKEN", "kv-token");
    expect(resolveUpstashCreds().url).toBe("https://canonical.upstash.io");
    expect(resolveUpstashCreds().token).toBe("canon-token");
  });

  it("never uses the read-only token", () => {
    clear();
    vi.stubEnv("UPSTASH_REDIS_KV_REST_API_READ_ONLY_TOKEN", "readonly");
    expect(resolveUpstashCreds().token).toBeUndefined();
  });

  it("returns undefined (not empty string) when nothing is set", () => {
    clear();
    expect(resolveUpstashCreds()).toEqual({ url: undefined, token: undefined });
  });
});
