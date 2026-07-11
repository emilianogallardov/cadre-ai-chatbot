import { describe, expect, it } from "vitest";
import { toPayloadMessages } from "../payload";
import { validateMessages } from "../validate";
import { ChatMessage, LIMITS } from "../types";
import { MAX_PROMPT_TURNS } from "@/lib/prompt/assemble";

/** Build an n-message strictly-alternating transcript starting with user. */
function alternating(
  n: number,
  contentFor: (i: number) => string,
): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as ChatMessage["role"],
    content: contentFor(i),
  }));
}

const totalChars = (msgs: ChatMessage[]) =>
  msgs.reduce((n, m) => n + m.content.length, 0);

describe("toPayloadMessages", () => {
  it("passes a well-formed conversation through unchanged", () => {
    const input = [
      { role: "user" as const, content: "What does Cadre AI do?" },
      { role: "assistant" as const, content: "It is a consultancy." },
      { role: "user" as const, content: "Which industries?" },
    ];
    expect(toPayloadMessages(input)).toEqual(input);
  });

  it("drops empty messages left by a stopped assistant turn", () => {
    const result = toPayloadMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "" },
    ]);
    expect(result).toEqual([{ role: "user", content: "hi" }]);
  });

  it("merges consecutive user turns after a failed response", () => {
    const result = toPayloadMessages([
      { role: "user", content: "first try" },
      { role: "user", content: "second try" },
    ]);
    expect(result).toEqual([
      { role: "user", content: "first try\n\nsecond try" },
    ]);
  });

  it("drops a leading assistant message", () => {
    const result = toPayloadMessages([
      { role: "assistant", content: "greeting" },
      { role: "user", content: "hi" },
    ]);
    expect(result).toEqual([{ role: "user", content: "hi" }]);
  });

  it("does not mutate its input", () => {
    const input = [
      { role: "user" as const, content: "a" },
      { role: "user" as const, content: "b" },
    ];
    toPayloadMessages(input);
    expect(input[0].content).toBe("a");
  });

  it("produces output that passes server validation after error-retry", () => {
    // Error path: assistant placeholder dropped, user retries with a new turn.
    const transcript = [
      { role: "user" as const, content: "question that failed" },
      { role: "user" as const, content: "asking again" },
    ];
    expect(() => validateMessages(toPayloadMessages(transcript))).not.toThrow();
  });

  it("produces output that passes server validation after a stopped turn", () => {
    // Abort path: empty assistant message stays in the transcript.
    const transcript = [
      { role: "user" as const, content: "question" },
      { role: "assistant" as const, content: "" },
      { role: "user" as const, content: "follow-up" },
    ];
    expect(() => validateMessages(toPayloadMessages(transcript))).not.toThrow();
  });
});

describe("toPayloadMessages windowing", () => {
  it("P1: windows a long user-ending transcript to the tail, most-recent-last, starting AND ending with user", () => {
    // 61 messages, user at even indices — ends with the user turn being
    // answered, matching send()'s calling precondition. A valid alternating
    // user-start/user-end payload has odd length, so the window tops out at
    // promptWindowTurns - 1.
    const input = alternating(61, (i) => `m${i}`);
    const result = toPayloadMessages(input);

    expect(result).toHaveLength(LIMITS.promptWindowTurns - 1);
    expect(result[0].role).toBe("user");
    expect(result[result.length - 1].role).toBe("user");
    // Most-recent-last: the final window message is the final input message.
    expect(result[result.length - 1].content).toBe("m60");
    // Exactly the tail slice, in order, and server-valid.
    expect(result.map((m) => m.content)).toEqual(
      Array.from(
        { length: LIMITS.promptWindowTurns - 1 },
        (_, k) => `m${50 + k}`,
      ),
    );
    expect(() => validateMessages(result)).not.toThrow();
  });

  it("P2: truncates an oversized single assistant reply to maxMessageChars", () => {
    const result = toPayloadMessages([
      { role: "user", content: "q" },
      { role: "assistant", content: "x".repeat(2500) },
    ]);
    const assistant = result.find((m) => m.role === "assistant");
    expect(assistant?.content.length).toBe(LIMITS.maxMessageChars);
  });

  it("P2: an overflowing same-role merge keeps the NEWEST content whole", () => {
    const result = toPayloadMessages([
      { role: "user", content: "a".repeat(1500) },
      { role: "user", content: "b".repeat(1500) },
    ]);
    // Consecutive user turns are retries: when the merge would overflow the
    // per-message cap, the latest phrasing IS the question — keep it, drop
    // the superseded one.
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("b".repeat(1500));
  });

  it("P6: an edited retry after a max-length message is what the model receives", () => {
    // Codex round-6 #1: an old 2000-char failed question plus a distinct
    // edited retry. Prefix truncation of the merge would silently send the
    // OLD question while the UI shows the new one.
    const result = toPayloadMessages([
      { role: "user", content: "x".repeat(2000) },
      { role: "user", content: "RETRY-MARKER what does Cadre do?" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("RETRY-MARKER");
    expect(() => validateMessages(result)).not.toThrow();
  });

  it("P3: drops oldest windowed messages until the total fits maxTotalChars", () => {
    // 12 windowed messages of 800 chars = 9600 > 8000, so oldest are dropped.
    const input = alternating(25, () => "x".repeat(800));
    const result = toPayloadMessages(input);

    expect(totalChars(result)).toBeLessThanOrEqual(LIMITS.maxTotalChars);
    expect(result.length).toBeLessThan(LIMITS.promptWindowTurns);
    expect(() => validateMessages(result)).not.toThrow();
  });

  it("P4: the invariant — validateMessages(toPayloadMessages(t)) never throws", () => {
    const transcripts: ChatMessage[][] = [];

    // Long realistic sessions: complete user/assistant exchanges plus the
    // trailing user turn being answered, at a range of lengths.
    for (let pairs = 1; pairs <= 40; pairs++) {
      const t: ChatMessage[] = [];
      for (let p = 0; p < pairs; p++) {
        t.push({ role: "user", content: `question ${p} ${"detail ".repeat(20)}` });
        t.push({ role: "assistant", content: `answer ${p} ${"reply ".repeat(40)}` });
      }
      t.push({ role: "user", content: `final question after ${pairs} exchanges` });
      transcripts.push(t);
    }

    // Chatty: many short turns, every length from 1 up, always ending on user.
    for (let n = 1; n <= 60; n++) {
      const t = alternating(n, (i) => (i % 2 === 0 ? `u${i}` : `a${i}`));
      if (t.length > 0 && t[t.length - 1].role === "assistant") {
        t.push({ role: "user", content: "one more thing" });
      }
      transcripts.push(t);
    }

    // Retry-shaped: leading empty, stopped assistant turns, consecutive user
    // retries, oversized messages — still ending on the user's live question.
    transcripts.push([
      { role: "user", content: "" },
      { role: "user", content: "first attempt" },
      { role: "assistant", content: "" },
      { role: "user", content: "second attempt" },
      { role: "assistant", content: "ok ".repeat(1500) },
      { role: "user", content: "z".repeat(2500) },
    ]);

    // Pathological: every turn oversized so truncation AND drop-oldest both fire.
    const big: ChatMessage[] = [];
    for (let p = 0; p < 30; p++) {
      big.push({ role: "user", content: "u".repeat(2500) });
      big.push({ role: "assistant", content: "a".repeat(2500) });
    }
    big.push({ role: "user", content: "final ".repeat(600) });
    transcripts.push(big);

    for (const t of transcripts) {
      expect(() => validateMessages(toPayloadMessages(t))).not.toThrow();
    }
  });

  it("P5: LIMITS.promptWindowTurns === MAX_PROMPT_TURNS so the windows cannot drift", () => {
    expect(LIMITS.promptWindowTurns).toBe(MAX_PROMPT_TURNS);
  });
});
