import { describe, expect, it } from "vitest";
import { canSpeak, prepareUtterance } from "../useSpeechOutput";

describe("prepareUtterance", () => {
  it("collapses runs of whitespace to single spaces and trims", () => {
    expect(prepareUtterance("  hello \n  world  ")).toBe("hello world");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(prepareUtterance("   \n\t ")).toBe("");
  });

  it("leaves already-clean text unchanged", () => {
    expect(prepareUtterance("A clean reply.")).toBe("A clean reply.");
  });
});

describe("canSpeak", () => {
  it("is true only when supported, enabled, and there is speakable text", () => {
    expect(canSpeak(true, true, "hi")).toBe(true);
  });

  it("is false when unsupported (feature-detection failed / SSR)", () => {
    expect(canSpeak(false, true, "hi")).toBe(false);
  });

  it("is false when disabled (off by default, never autoplay)", () => {
    expect(canSpeak(true, false, "hi")).toBe(false);
  });

  it.each(["", "   ", "\n"])("is false for blank text %j", (text) => {
    expect(canSpeak(true, true, text)).toBe(false);
  });
});
