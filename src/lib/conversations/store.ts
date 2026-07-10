/**
 * Conversation + message persistence (ADR-008).
 *
 * Writes happen only server-side with the Supabase secret key, over the
 * PostgREST HTTP endpoint using plain `fetch` — the same auditable one-request
 * posture as the escalation store, no SDK. Storage is best-effort background
 * work behind the chat response: every function here swallows its own failures
 * (logging an HTTP status only, never message content) so a storage outage can
 * never surface to the visitor or break a reply. When the storage secrets are
 * absent, every function is an immediate no-op.
 */

import { isStorageConfigured } from "./token";

/** Stored content is length-capped on both roles (ADR-008 #9). */
const MAX_CONTENT = 4000;

interface SupabaseConfig {
  url: string;
  key: string;
}

/**
 * Resolve the Supabase endpoint, requiring https so a mis-set SUPABASE_URL
 * fails closed instead of forwarding the service key somewhere unexpected.
 * Returns null (callers no-op) when unconfigured or non-https.
 */
function config(): SupabaseConfig | null {
  if (!isStorageConfigured()) return null;
  const url = process.env.SUPABASE_URL as string;
  const key = process.env.SUPABASE_SECRET_KEY as string;
  if (!url.startsWith("https://")) {
    console.error("[conversations] SUPABASE_URL must be https; storage disabled.");
    return null;
  }
  return { url: url.replace(/\/$/, ""), key };
}

function headers(key: string, prefer: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: prefer,
  };
}

/** Idempotent conversation upsert, bumping last_message_at to now. */
async function upsertConversation(
  cfg: SupabaseConfig,
  conversationId: string,
): Promise<Response> {
  return fetch(`${cfg.url}/rest/v1/conversations`, {
    method: "POST",
    redirect: "error",
    headers: headers(cfg.key, "resolution=merge-duplicates"),
    body: JSON.stringify({
      id: conversationId,
      last_message_at: new Date().toISOString(),
    }),
  });
}

/**
 * Persist one completed turn: an idempotent conversation upsert followed by the
 * user and assistant messages in a single insert. A client retry with the same
 * `turnId` dedups against the `(conversation_id, turn_id, role)` unique index
 * via `resolution=ignore-duplicates`. Never throws.
 */
export async function storeTurn(input: {
  conversationId: string;
  turnId: string;
  userText: string;
  assistantText: string;
}): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  try {
    const upsert = await upsertConversation(cfg, input.conversationId);
    if (!upsert.ok) {
      console.error(
        `[conversations] conversation upsert failed (HTTP ${upsert.status}).`,
      );
      return;
    }

    const rows = [
      {
        conversation_id: input.conversationId,
        turn_id: input.turnId,
        role: "user",
        content: input.userText.slice(0, MAX_CONTENT),
      },
      {
        conversation_id: input.conversationId,
        turn_id: input.turnId,
        role: "assistant",
        content: input.assistantText.slice(0, MAX_CONTENT),
      },
    ];
    const insert = await fetch(`${cfg.url}/rest/v1/messages`, {
      method: "POST",
      redirect: "error",
      headers: headers(cfg.key, "resolution=ignore-duplicates"),
      body: JSON.stringify(rows),
    });
    if (!insert.ok) {
      console.error(
        `[conversations] message insert failed (HTTP ${insert.status}).`,
      );
    }
  } catch {
    // Network or unexpected error — status is unknown; never log content.
    console.error("[conversations] storeTurn failed (no response).");
  }
}

/**
 * Idempotent conversation upsert used by the escalation route before it inserts
 * a linked lead, eliminating the FK race with the post-stream turn write
 * (ADR-008 #5). Returns false (never throws) on any failure.
 */
export async function linkConversation(
  conversationId: string,
): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;
  try {
    const response = await upsertConversation(cfg, conversationId);
    if (!response.ok) {
      console.error(
        `[conversations] linkConversation failed (HTTP ${response.status}).`,
      );
    }
    return response.ok;
  } catch {
    console.error("[conversations] linkConversation failed (no response).");
    return false;
  }
}

/**
 * Cascade-delete a conversation (messages follow via ON DELETE CASCADE) for the
 * "Delete this chat" control. Returns true on a 2xx, false (never throws)
 * otherwise.
 */
export async function deleteConversation(
  conversationId: string,
): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;
  try {
    const response = await fetch(
      `${cfg.url}/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}`,
      {
        method: "DELETE",
        redirect: "error",
        headers: headers(cfg.key, "return=minimal"),
      },
    );
    if (!response.ok) {
      console.error(
        `[conversations] deleteConversation failed (HTTP ${response.status}).`,
      );
    }
    return response.ok;
  } catch {
    console.error("[conversations] deleteConversation failed (no response).");
    return false;
  }
}
