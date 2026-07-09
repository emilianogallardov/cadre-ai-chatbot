/**
 * Escalation types (ADR-005: minimize and isolate escalation data).
 *
 * The unknown-answer path collects only the minimal lead fields — name, email,
 * question, and an explicit consent — and the server stamps the consent
 * timestamp. There is no company field (ADR-005 minimal), no transcript, and no
 * public read path. See docs/architecture/data-and-storage.md.
 */

/** Validated, normalized fields accepted from the browser. */
export interface EscalationInput {
  name: string;
  email: string;
  question: string;
  /** Must be literal `true`; the user affirmatively consented to be contacted. */
  consent: boolean;
}

/** What the server persists: the input plus the server-recorded consent time. */
export interface EscalationRecord extends EscalationInput {
  /** ISO-8601 instant the server recorded consent (never client-supplied). */
  consented_at: string;
}

/** Typed, user-safe outcome of POST /api/escalations. */
export type EscalationResult =
  | { ok: true; referenceId: string }
  | {
      ok: false;
      code: "invalid" | "rate_limited" | "store_failed";
      message: string;
    };
