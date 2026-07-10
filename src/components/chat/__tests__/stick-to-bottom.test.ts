import { describe, expect, it } from "vitest";
import { isNearBottom, STICK_THRESHOLD_PX } from "../stickToBottom";

describe("isNearBottom", () => {
  it("sticks when scrolled exactly to the bottom", () => {
    // 1000px of content, 400px viewport, scrolled all the way (600).
    expect(isNearBottom(600, 400, 1000)).toBe(true);
  });

  it("sticks within the threshold of the bottom", () => {
    expect(isNearBottom(600 - STICK_THRESHOLD_PX, 400, 1000)).toBe(true);
    expect(isNearBottom(599, 400, 1000)).toBe(true);
  });

  it("releases just past the threshold", () => {
    expect(isNearBottom(600 - STICK_THRESHOLD_PX - 1, 400, 1000)).toBe(false);
  });

  it("releases when scrolled far up", () => {
    expect(isNearBottom(0, 400, 1000)).toBe(false);
  });

  it("sticks when content does not overflow the viewport", () => {
    expect(isNearBottom(0, 400, 300)).toBe(true);
    expect(isNearBottom(0, 400, 400)).toBe(true);
  });

  it("does not stick during top rubber-band overscroll of long content", () => {
    // iOS overscroll reports a negative scrollTop at the very top.
    expect(isNearBottom(-20, 400, 1000)).toBe(false);
  });

  it("honors a custom threshold", () => {
    expect(isNearBottom(500, 400, 1000, 100)).toBe(true);
    expect(isNearBottom(499, 400, 1000, 100)).toBe(false);
  });
});
