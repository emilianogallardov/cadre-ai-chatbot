import { describe, expect, it } from "vitest";
import { joinTranscript } from "../useSpeechInput";

describe("joinTranscript", () => {
  it("returns the addition when the base is empty", () => {
    expect(joinTranscript("", "hello there")).toBe("hello there");
  });

  it("appends a fragment with exactly one space", () => {
    expect(joinTranscript("Do you", "work with logistics")).toBe(
      "Do you work with logistics",
    );
  });

  it("does not double-space when the base has trailing whitespace", () => {
    expect(joinTranscript("Do you ", "work")).toBe("Do you work");
  });

  it("trims surrounding whitespace from the addition", () => {
    expect(joinTranscript("Hi", "  there  ")).toBe("Hi there");
  });

  it.each(["", "   ", "\n\t"])(
    "returns the base unchanged for blank addition %j",
    (addition) => {
      expect(joinTranscript("keep me", addition)).toBe("keep me");
    },
  );

  it("preserves interior whitespace of the base", () => {
    expect(joinTranscript("a b", "c")).toBe("a b c");
  });
});
