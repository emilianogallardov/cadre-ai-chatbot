import { ChatMessage } from "./types";

/**
 * Normalize a transcript into a payload the server's structural validation
 * accepts: no empty messages, strict user/assistant alternation starting with
 * user. Real transcripts drift from that shape in two legitimate ways — a
 * stopped or failed assistant turn leaves an empty message, and a retried
 * question produces two consecutive user turns — so empties are dropped and
 * consecutive same-role turns are merged rather than rejected.
 */
export function toPayloadMessages(messages: ChatMessage[]): ChatMessage[] {
  const cleaned: ChatMessage[] = [];
  for (const message of messages) {
    const content = message.content.trim();
    if (!content) continue;
    if (cleaned.length === 0 && message.role === "assistant") continue;

    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === message.role) {
      prev.content = `${prev.content}\n\n${content}`;
    } else {
      cleaned.push({ role: message.role, content });
    }
  }
  return cleaned;
}
