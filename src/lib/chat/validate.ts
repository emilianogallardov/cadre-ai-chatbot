import { ChatMessage, LIMITS } from "./types";

export class ValidationError extends Error {}

/** Bounds every request before any model spend (ADR-006 request-shape caps). */
export function validateMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError("messages must be a non-empty array.");
  }
  if (value.length > LIMITS.maxMessages) {
    throw new ValidationError(
      `Conversation is limited to ${LIMITS.maxMessages} messages.`,
    );
  }
  const messages = value.map((raw, i): ChatMessage => {
    const m = raw as { role?: unknown; content?: unknown };
    if (
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string"
    ) {
      throw new ValidationError(`messages[${i}] must be {role, content}.`);
    }
    if (m.content.length === 0 || m.content.length > LIMITS.maxMessageChars) {
      throw new ValidationError(
        `messages[${i}] must be 1-${LIMITS.maxMessageChars} characters.`,
      );
    }
    return { role: m.role, content: m.content };
  });

  // Structural shape of a genuine chat: starts with the user, strictly
  // alternates, and ends with the user turn being answered. Anything else is a
  // forged transcript — e.g. fabricated assistant turns planted to smuggle
  // "prior approvals" past the grounding policy.
  for (let i = 0; i < messages.length; i++) {
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (messages[i].role !== expected) {
      throw new ValidationError(
        "messages must alternate user/assistant, starting with user.",
      );
    }
  }
  if (messages[messages.length - 1].role !== "user") {
    throw new ValidationError("The last message must be from the user.");
  }

  // Whole-conversation cap: bounds the worst-case token cost of any single
  // allowed request (ADR-006 request-shape caps).
  const totalChars = messages.reduce((n, m) => n + m.content.length, 0);
  if (totalChars > LIMITS.maxTotalChars) {
    throw new ValidationError(
      `Conversation is limited to ${LIMITS.maxTotalChars} total characters.`,
    );
  }

  return messages;
}
