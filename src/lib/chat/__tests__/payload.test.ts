import { describe, expect, it } from "vitest";
import { toPayloadMessages } from "../payload";
import { validateMessages } from "../validate";

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
