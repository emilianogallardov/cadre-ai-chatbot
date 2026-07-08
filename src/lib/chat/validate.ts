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
  return value.map((raw, i) => {
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
}
