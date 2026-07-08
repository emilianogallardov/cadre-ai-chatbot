/**
 * Shared chat types and the streaming wire protocol.
 *
 * The server streams newline-delimited JSON (NDJSON) events. Keeping the
 * protocol structured from the mock phase onward means the client does not
 * change when the real model gateway and action cards arrive (plan.md
 * Phases 2-3).
 */

export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

/** One suggested action the UI renders as a card (verified links only). */
export interface ActionCard {
  kind: "strategy_contact" | "maturity_index" | "portal_help" | "escalation";
  title: string;
  body: string;
  /** Verified Cadre URL; never model-invented. */
  url?: string;
}

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "action"; card: ActionCard }
  | { type: "done" }
  | { type: "error"; code: ErrorCode; message: string };

export type ErrorCode =
  | "invalid_request"
  | "rate_limited"
  | "provider_error"
  | "server_error";

/** Request body accepted by POST /api/chat. */
export interface ChatRequest {
  messages: ChatMessage[];
}

/** Bounds enforced before any model spend (see ADR-006). */
export const LIMITS = {
  maxMessages: 30,
  maxMessageChars: 2000,
} as const;
