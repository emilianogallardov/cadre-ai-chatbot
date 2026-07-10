import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Signed conversation tokens (ADR-008).
 *
 * A conversation id is a server-minted UUID; the token handed to the client is
 * `${uuid}.${hmac}` where the HMAC (SHA-256, `CONVERSATION_SIGNING_SECRET`) is
 * taken over the uuid. The signature means a client cannot forge or guess an id
 * to pollute analytics or attach junk to a known conversation: a later turn or
 * escalation-link request must present a validly signed token, and anything
 * that does not verify is silently treated as "new conversation," never an
 * error. Server-only — the secret never reaches the browser.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sign(uuid: string, secret: string): string {
  return createHmac("sha256", secret).update(uuid).digest("hex");
}

/**
 * True only when every secret the storage path needs is present. Callers gate
 * minting on this; verification degrades to `null` on its own without it.
 */
export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.CONVERSATION_SIGNING_SECRET &&
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_SECRET_KEY,
  );
}

/**
 * Mint a fresh signed conversation token. Throws if the secret is missing —
 * callers mint only after checking {@link isStorageConfigured}.
 */
export function mintConversationToken(): string {
  const secret = process.env.CONVERSATION_SIGNING_SECRET;
  if (!secret) {
    throw new Error("CONVERSATION_SIGNING_SECRET is not set.");
  }
  const uuid = randomUUID();
  return `${uuid}.${sign(uuid, secret)}`;
}

/**
 * Return the conversation UUID when `token` is a string of the exact
 * `uuid.hexHmac` shape with a signature that verifies, else `null`. Never
 * throws — a missing secret, wrong shape, or bad signature all yield `null`.
 */
export function verifyConversationToken(token: unknown): string | null {
  const secret = process.env.CONVERSATION_SIGNING_SECRET;
  if (!secret) return null;
  if (typeof token !== "string") return null;

  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const uuid = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!UUID_RE.test(uuid)) return null;

  const expected = sign(uuid, secret);
  // timingSafeEqual requires equal-length buffers; the length guard also
  // rejects a signature that is the wrong shape before the constant-time compare.
  if (signature.length !== expected.length) return null;
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return null;
  return timingSafeEqual(a, b) ? uuid : null;
}
