/**
 * Client-side conversation-storage plumbing (ADR-008).
 *
 * Per-tab session state (the conversation token and the private-mode flag) and
 * the pure request/response helpers that decide what each send and each control
 * sends to the server. Keeping the decisions in exported pure functions lets
 * them be unit-tested without a DOM, matching the pattern in EscalationCard and
 * useSpeechOutput. All sessionStorage access is guarded for SSR and for
 * environments where storage is blocked (private browsing, quota).
 */

import type { ChatMessage, ChatRequest } from "@/lib/chat/types";

/** Per-tab keys. sessionStorage so a new tab starts a fresh conversation. */
export const TOKEN_KEY = "cadre-conversation-token";
export const PRIVATE_KEY = "cadre-private-mode";

/** Notice-at-collection copy, keyed to whether private mode is on (ADR-008 #2). */
export const NOTICE_DEFAULT =
  "Chats are saved to help Cadre improve support — please don't share sensitive info.";
// "New messages": private mode stops future writes; turns saved before the
// toggle stay saved until "Delete this chat" removes them (Codex #3).
export const NOTICE_PRIVATE =
  "Private mode is on — new messages aren't being saved.";

/** The single line shown under the composer flips its first clause in private mode. */
export function noticeText(privateMode: boolean): string {
  return privateMode ? NOTICE_PRIVATE : NOTICE_DEFAULT;
}

// --- session state ---------------------------------------------------------

// In-memory mirror, the source of truth for reads. sessionStorage is only the
// per-tab persistence layer (surviving reloads); when it throws (blocked
// storage, quota), state still works for the life of the page — so a Private
// toggle can never be silently dropped and revert to saving (Codex #2).
let memoryToken: string | null = null;
let memoryPrivate = false;
let hydrated = false;

/** Pull persisted values into the mirror once, on first client-side read. */
function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    memoryToken = sessionStorage.getItem(TOKEN_KEY) || null;
    memoryPrivate = sessionStorage.getItem(PRIVATE_KEY) === "1";
  } catch {
    // Persistence unavailable; the mirror starts from defaults.
  }
}

export function readConversationToken(): string | null {
  hydrate();
  return memoryToken;
}

export function writeConversationToken(token: string): void {
  hydrate();
  memoryToken = token;
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Mirror already updated; the token just won't survive a reload.
  }
  emit();
}

export function clearConversationToken(): void {
  hydrate();
  memoryToken = null;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Mirror already cleared.
  }
  emit();
}

export function readPrivateMode(): boolean {
  hydrate();
  return memoryPrivate;
}

export function writePrivateMode(on: boolean): void {
  hydrate();
  memoryPrivate = on;
  try {
    if (on) {
      sessionStorage.setItem(PRIVATE_KEY, "1");
    } else {
      sessionStorage.removeItem(PRIVATE_KEY);
    }
  } catch {
    // Mirror already updated; the preference just won't survive a reload.
  }
  emit();
}

/** Resets the in-memory mirror (tests only). */
export function resetSessionStateForTests(): void {
  memoryToken = null;
  memoryPrivate = false;
  hydrated = false;
}

/**
 * Minimal external store so components can read the per-tab session state with
 * useSyncExternalStore — SSR-safe hydration without a setState-in-effect
 * cascade, matching useSpeechOutput's feature-detection pattern. getSnapshot
 * returns primitives (string | null, boolean) so React's Object.is check is
 * stable and never loops. The mutators above notify after writing.
 */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- pure request/response helpers -----------------------------------------

export interface BuildChatRequestArgs {
  messages: ChatMessage[];
  turnId: string;
  conversationToken?: string | null;
  privateMode?: boolean;
}

/**
 * Assemble the POST /api/chat body. The optional storage fields are included
 * only when meaningful — an absent token stays absent (never `""`) so the
 * server treats the turn as a new conversation, and `private` is sent only when
 * true so the default request shape is unchanged.
 */
export function buildChatRequestBody({
  messages,
  turnId,
  conversationToken,
  privateMode,
}: BuildChatRequestArgs): ChatRequest {
  const body: ChatRequest = { messages, turnId };
  if (conversationToken) body.conversationToken = conversationToken;
  if (privateMode) body.private = true;
  return body;
}

/**
 * The conversation token an escalation should carry (ADR-008 #8): only when
 * private mode is off and a token exists. Private escalations still store the
 * lead, but unlinked (server sets conversation_id null).
 */
export function linkedConversationToken(
  privateMode: boolean,
  token: string | null | undefined,
): string | undefined {
  return !privateMode && token ? token : undefined;
}

/** True only for a well-formed `{ ok: true }` DELETE /api/conversations reply. */
export function deleteSucceeded(body: unknown): boolean {
  return (
    !!body &&
    typeof body === "object" &&
    (body as Record<string, unknown>).ok === true
  );
}
