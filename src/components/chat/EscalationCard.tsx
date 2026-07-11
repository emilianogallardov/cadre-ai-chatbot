"use client";

import { useId, useRef, useState } from "react";
import type { ActionCard } from "@/lib/chat/types";
import {
  linkedConversationToken,
  readConversationToken,
  readPrivateMode,
} from "./conversationStorage";

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

/**
 * True once any follow-up request was successfully submitted this browser
 * session. The transcript uses this to stop offering NEW escalation forms —
 * one submitted request already covers the conversation.
 */
export function hasSubmittedEscalation(): boolean {
  return submissionCount() > 0;
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
  "relative mt-4 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/85 p-4 shadow-[0_14px_34px_-22px_rgba(0,0,0,0.6)] ring-1 ring-black/[0.025] sm:p-5 dark:border-zinc-800 dark:bg-zinc-900/85 dark:ring-white/[0.05]";

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-zinc-300/80 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-[inset_0_1px_0_rgba(0,0,0,0.03)] outline-none transition-[border-color,box-shadow] focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-zinc-400/40 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

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
      // Link the lead to the stored conversation only when private mode is off
      // and a token exists (ADR-008 #8). Private escalations are still stored,
      // just unlinked. Read at submit time so a mid-conversation toggle wins.
      const conversationToken = linkedConversationToken(
        readPrivateMode(),
        readConversationToken(),
      );
      const res = await fetch("/api/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          question: question.trim(),
          consent: true,
          ...(conversationToken ? { conversationToken } : {}),
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
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">
              Request received
            </p>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
              {phase.referenceId
                ? `Reference ${phase.referenceId}. Your request is saved for Cadre's team — for anything urgent, email ${CONTACT_EMAIL} directly.`
                : `Your request is saved for Cadre's team — for anything urgent, email ${CONTACT_EMAIL} directly.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const error = phase.name === "form" ? phase.error : null;

  return (
    <form className={cardFrame} onSubmit={handleSubmit} aria-busy={sending}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
        Talk to the Cadre team
      </p>
      <p className="mt-1 text-sm font-semibold tracking-tight">{card.title}</p>
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

      <div className="mt-3 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
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
            className="mt-0.5 size-4 accent-zinc-900 dark:accent-zinc-100"
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
          className="ui-lift mt-1 w-full cursor-pointer rounded-xl bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white shadow-sm hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:bg-zinc-100 dark:text-zinc-900"
        >
          {sending ? "Sending…" : "Request follow-up"}
        </button>
      </div>
    </form>
  );
}
