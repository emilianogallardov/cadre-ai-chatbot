import { EscalationInput } from "./types";

export class ValidationError extends Error {}

// Conservative field-length limits (data-and-storage.md: "enforce conservative
// field-length limits"). Email cap is the RFC 5321 practical maximum.
const NAME_MAX = 100;
const EMAIL_MAX = 254;
const QUESTION_MAX = 2000;

// Deliberately strict single-shape check: one local part, one "@", one domain
// with a dotted TLD of at least two chars, and no whitespace anywhere. This is a
// normalization/sanity gate, not full RFC 5322 — deliverability is proven by the
// eventual human follow-up, not by this regex.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validate and normalize an escalation submission (ADR-005 minimal fields).
 *
 * Mirrors lib/chat/validate.ts: a single synchronous pass that throws a
 * ValidationError with a field-specific message on the first problem, and
 * returns a fully normalized object (trimmed name/question, trimmed+lowercased
 * email) so the store layer never re-derives shape.
 */
export function validateEscalation(value: unknown): EscalationInput {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError("Request body must be a JSON object.");
  }
  const v = value as {
    name?: unknown;
    email?: unknown;
    question?: unknown;
    consent?: unknown;
  };

  if (typeof v.name !== "string") {
    throw new ValidationError("name is required.");
  }
  const name = v.name.trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    throw new ValidationError(`name must be 1-${NAME_MAX} characters.`);
  }

  if (typeof v.email !== "string") {
    throw new ValidationError("email is required.");
  }
  const email = v.email.trim().toLowerCase();
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    throw new ValidationError("email must be a valid email address.");
  }

  if (typeof v.question !== "string") {
    throw new ValidationError("question is required.");
  }
  const question = v.question.trim();
  if (question.length < 1 || question.length > QUESTION_MAX) {
    throw new ValidationError(`question must be 1-${QUESTION_MAX} characters.`);
  }

  // Consent must be the literal boolean true — not "true", not 1, not truthy.
  // The persisted lead exists only because the user affirmatively opted in.
  if (v.consent !== true) {
    throw new ValidationError("consent is required to submit this request.");
  }

  return { name, email, question, consent: true };
}
