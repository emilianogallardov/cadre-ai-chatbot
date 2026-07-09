"use client";

import { useId, useRef, useState } from "react";
import type { ActionCard } from "@/lib/chat/types";

export const CONTACT_EMAIL = "hello@gocadre.ai";

/** Shown when the network fails or the response is unparseable/malformed. */
export const GENERIC_FAILURE = `Something went wrong sending your request. Please email ${CONTACT_EMAIL} directly.`;

/**
 * Per-browser-session cap on successful escalations, persisted in
 * sessionStorage so a reload does not reset it (the server's per-IP daily cap
 * is the real guard; this only keeps the UI honest). Falls back to a
 * module-level counter when storage is unavailable.
 */
const MAX_SESSION_SUBMISSIONS = 2;
const SESSION_KEY = "cadre-escalations-submitted";
let fallbackCount = 0;

function submissionCount(): number {
  try {
    return Number(sessionStorage.getItem(SESSION_KEY) ?? "0") || 0;
  } catch {
    return fallbackCount;
  }
}

function recordSubmission(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, String(submissionCount() + 1));
  } catch {
    fallbackCount += 1;
  }
}

const MAX = { name: 100, email: 254, question: 2000 } as const;

export interface EscalationFields {
  name: string;
  email: string;
  question: string;
  consent: boolean;
}

/**
 * Client-side submit gate. The server revalidates every field (ADR-004); this
 * only prevents obviously-incomplete requests from being sent.
 */
export function canSubmit(f: EscalationFields): boolean {
  return (
    f.name.trim().length > 0 &&
    f.email.trim().length > 0 &&
    f.question.trim().length > 0 &&
    f.consent
  );
}

export type SubmitOutcome =
  | { status: "confirmed"; referenceId: string }
  | { status: "error"; message: string };

/**
 * Maps a parsed /api/escalations response body to a UI outcome. Failure
 * messages from the server are user-safe and surfaced verbatim; anything
 * malformed falls back to the generic contact-us text.
 */
export function outcomeFromResponse(body: unknown): SubmitOutcome {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.ok === true && typeof b.referenceId === "string" && b.referenceId) {
      return { status: "confirmed", referenceId: b.referenceId };
    }
    if (b.ok === false && typeof b.message === "string" && b.message) {
      return { status: "error", message: b.message };
    }
  }
  return { status: "error", message: GENERIC_FAILURE };
}

type Phase =
  | { name: "form"; error: string | null }
  | { name: "sending" }
  | { name: "confirmed"; referenceId: string | null };

const cardFrame =
  "mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900";

const fieldClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

const labelClass =
  "block text-xs font-medium text-zinc-600 dark:text-zinc-400";

export function EscalationCard({ card }: { card: ActionCard }) {
  const ids = useId();
  const nameId = `${ids}-name`;
  const emailId = `${ids}-email`;
  const questionId = `${ids}-question`;
  const consentId = `${ids}-consent`;
  const errorId = `${ids}-error`;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>(() =>
    submissionCount() >= MAX_SESSION_SUBMISSIONS
      ? { name: "confirmed", referenceId: null }
      : { name: "form", error: null },
  );
  // Synchronous double-submit guard: state updates flush asynchronously, so a
  // rapid second click could pass the `sending` check before React re-renders.
  const inFlight = useRef(false);

  const sending = phase.name === "sending";
  const ready = canSubmit({ name, email, question, consent });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!canSubmit({ name, email, question, consent })) return;
    if (submissionCount() >= MAX_SESSION_SUBMISSIONS) {
      setPhase({ name: "confirmed", referenceId: null });
      return;
    }
    inFlight.current = true;
    setPhase({ name: "sending" });
    try {
      const res = await fetch("/api/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          question: question.trim(),
          consent: true,
        }),
      });
      const outcome = outcomeFromResponse(await res.json());
      if (outcome.status === "confirmed") {
        recordSubmission();
        setPhase({ name: "confirmed", referenceId: outcome.referenceId });
      } else {
        setPhase({ name: "form", error: outcome.message });
      }
    } catch {
      setPhase({ name: "form", error: GENERIC_FAILURE });
    } finally {
      inFlight.current = false;
    }
  }

  if (phase.name === "confirmed") {
    return (
      <div className={cardFrame}>
        <p className="text-sm font-medium">Request received</p>
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          {phase.referenceId
            ? `Reference ${phase.referenceId}. A Cadre team member will follow up by email.`
            : `A Cadre team member will follow up by email. You can also reach us directly at ${CONTACT_EMAIL}.`}
        </p>
      </div>
    );
  }

  const error = phase.name === "form" ? phase.error : null;

  return (
    <form className={cardFrame} onSubmit={handleSubmit} aria-busy={sending}>
      <p className="text-sm font-medium">{card.title}</p>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
        {card.body}
      </p>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-col gap-2">
        <div>
          <label htmlFor={nameId} className={labelClass}>
            Name
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            maxLength={MAX.name}
            disabled={sending}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={emailId} className={labelClass}>
            Email
          </label>
          <input
            id={emailId}
            type="email"
            value={email}
            maxLength={MAX.email}
            disabled={sending}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={questionId} className={labelClass}>
            Your question
          </label>
          <textarea
            id={questionId}
            rows={3}
            value={question}
            maxLength={MAX.question}
            disabled={sending}
            onChange={(e) => setQuestion(e.target.value)}
            className={`${fieldClass} resize-y`}
          />
        </div>

        <div className="flex items-start gap-2">
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            disabled={sending}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5"
          />
          <label
            htmlFor={consentId}
            className="text-xs text-zinc-600 dark:text-zinc-400"
          >
            I agree that Cadre may contact me about this question.
          </label>
        </div>

        <button
          type="submit"
          disabled={sending || !ready}
          className="mt-1 self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {sending ? "Sending…" : "Request follow-up"}
        </button>
      </div>
    </form>
  );
}
