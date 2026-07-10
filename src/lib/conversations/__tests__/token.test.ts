import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isStorageConfigured,
  mintConversationToken,
  verifyConversationToken,
} from "../token";

const SECRET = "test-conversation-signing-secret";

function stubStorageEnv() {
  vi.stubEnv("CONVERSATION_SIGNING_SECRET", SECRET);
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret-service-key");
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isStorageConfigured", () => {
  it("is true only when all three secrets are set", () => {
    stubStorageEnv();
    expect(isStorageConfigured()).toBe(true);
  });

  it("is false when the signing secret is missing", () => {
    vi.stubEnv("CONVERSATION_SIGNING_SECRET", "");
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-service-key");
    expect(isStorageConfigured()).toBe(false);
  });

  it("is false when a Supabase secret is missing", () => {
    vi.stubEnv("CONVERSATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(isStorageConfigured()).toBe(false);
  });
});

describe("mint / verify round-trip", () => {
  beforeEach(() => stubStorageEnv());

  it("verifies a freshly minted token back to its uuid", () => {
    const token = mintConversationToken();
    const uuid = verifyConversationToken(token);
    expect(uuid).not.toBeNull();
    expect(token.startsWith(`${uuid}.`)).toBe(true);
  });

  it("mints distinct ids each call", () => {
    expect(mintConversationToken()).not.toBe(mintConversationToken());
  });

  it("rejects a tampered id", () => {
    const token = mintConversationToken();
    const [uuid, sig] = token.split(".");
    // Flip one hex digit of the uuid; the signature no longer matches.
    const flipped = uuid[0] === "a" ? "b" : "a";
    const tampered = `${flipped}${uuid.slice(1)}.${sig}`;
    expect(verifyConversationToken(tampered)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = mintConversationToken();
    const [uuid, sig] = token.split(".");
    const flipped = sig[0] === "a" ? "b" : "a";
    expect(
      verifyConversationToken(`${uuid}.${flipped}${sig.slice(1)}`),
    ).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintConversationToken();
    vi.stubEnv("CONVERSATION_SIGNING_SECRET", "some-other-secret");
    expect(verifyConversationToken(token)).toBeNull();
  });

  it("rejects non-string, empty, and garbage inputs", () => {
    expect(verifyConversationToken(undefined)).toBeNull();
    expect(verifyConversationToken(null)).toBeNull();
    expect(verifyConversationToken(123)).toBeNull();
    expect(verifyConversationToken({})).toBeNull();
    expect(verifyConversationToken("")).toBeNull();
    expect(verifyConversationToken("no-dot-here")).toBeNull();
    expect(verifyConversationToken("not-a-uuid.deadbeef")).toBeNull();
    expect(verifyConversationToken(".sig")).toBeNull();
  });
});

describe("missing secret", () => {
  it("reports unconfigured and verifies nothing without throwing", () => {
    // Mint a valid token while configured, then drop the secret.
    stubStorageEnv();
    const token = mintConversationToken();
    vi.stubEnv("CONVERSATION_SIGNING_SECRET", "");
    expect(isStorageConfigured()).toBe(false);
    expect(verifyConversationToken(token)).toBeNull();
  });

  it("mintConversationToken throws when the secret is missing", () => {
    vi.stubEnv("CONVERSATION_SIGNING_SECRET", "");
    expect(() => mintConversationToken()).toThrow();
  });
});
