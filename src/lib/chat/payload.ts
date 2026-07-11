import { ChatMessage, LIMITS } from "./types";

/**
 * Normalize a transcript into a payload the server's structural validation
 * accepts, windowed to exactly what the server will use.
 *
 * The server rejects payloads over LIMITS.maxTotalChars / maxMessages /
 * maxMessageChars, but the prompt assembler only reads the last
 * LIMITS.promptWindowTurns turns. Sending the whole transcript therefore dies
 * mid-session once the accumulated history crosses a server cap, while adding
 * nothing the model would have seen. So the client sends only that window,
 * valid BY CONSTRUCTION under the product's calling precondition: `send()`
 * always appends a non-empty USER message last, so the input ends with a
 * user turn. For every such input, validateMessages(toPayloadMessages(t))
 * never throws (payload.test.ts P4). Inputs that violate the precondition
 * (empty transcript, assistant-final) are not produced by the product and
 * carry no guarantee. Server caps stay as defense in depth.
 *
 * Note the window is promptWindowTurns MESSAGES max, and a valid
 * user-start/user-end alternating payload has odd length — so real payloads
 * top out at promptWindowTurns - 1 messages.
 *
 * Real transcripts also drift from strict user/assistant alternation in two
 * legitimate ways — a stopped or failed assistant turn leaves an empty message,
 * and a retried question produces two consecutive user turns — so empties are
 * dropped and consecutive same-role turns are merged rather than rejected.
 *
 * This module reaches the client bundle, so it must not import prompt assembly
 * (which pulls in the knowledge base); the window size is shared through the
 * light LIMITS constant instead.
 */
export function toPayloadMessages(messages: ChatMessage[]): ChatMessage[] {
  // 1. Clean and merge: drop empties, drop a leading assistant, and collapse
  //    consecutive same-role turns into one message.
  const cleaned: ChatMessage[] = [];
  for (const message of messages) {
    const content = message.content.trim();
    if (!content) continue;
    if (cleaned.length === 0 && message.role === "assistant") continue;

    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === message.role) {
      const merged = `${prev.content}\n\n${content}`;
      // A merge that would overflow the per-message cap keeps the NEWEST
      // content whole: consecutive same-role user turns are retries, and the
      // latest phrasing is the question actually being asked — prefix
      // truncation here would silently send the model the OLD question
      // while the UI shows the new one (Codex round-6 #1).
      prev.content =
        merged.length > LIMITS.maxMessageChars
          ? content.slice(0, LIMITS.maxMessageChars)
          : merged;
    } else {
      cleaned.push({ role: message.role, content });
    }
  }

  // 2. Truncate any remaining oversized single message to the per-message
  //    cap. Assistant replies at 600 tokens can exceed 2000 chars; answers
  //    front-load their substance, so single-message truncation keeps the
  //    head.
  for (const m of cleaned) {
    if (m.content.length > LIMITS.maxMessageChars) {
      m.content = m.content.slice(0, LIMITS.maxMessageChars);
    }
  }

  // 3. Window to the last promptWindowTurns messages — exactly what the prompt
  //    assembler reads. Slicing an alternating list keeps it alternating.
  let windowed = cleaned.slice(-LIMITS.promptWindowTurns);

  // 4. Drop oldest while the window still exceeds the whole-conversation cap.
  //    Each message is <= maxMessageChars <= maxTotalChars, so this terminates
  //    with total <= maxTotalChars.
  let total = windowed.reduce((n, m) => n + m.content.length, 0);
  while (windowed.length > 1 && total > LIMITS.maxTotalChars) {
    total -= windowed[0].content.length;
    windowed = windowed.slice(1);
  }

  // 5. Ensure the window still starts with a user turn: a slice can land on a
  //    leading assistant message. Alternation is otherwise preserved by
  //    slicing an alternating list.
  if (windowed.length > 0 && windowed[0].role === "assistant") {
    windowed = windowed.slice(1);
  }

  return windowed;
}
