import { describe, expect, it } from "vitest";
import { isVerifiedHref } from "../verifiedLinks";

describe("isVerifiedHref", () => {
  it("allows Cadre's published origins over https", () => {
    expect(isVerifiedHref("https://cadreai.com/contact")).toBe(true);
    expect(isVerifiedHref("https://www.cadreai.com/case-studies")).toBe(true);
  });

  it("allows the verified contact routes", () => {
    expect(isVerifiedHref("mailto:hello@gocadre.ai")).toBe(true);
    expect(isVerifiedHref("mailto:HELLO@GOCADRE.AI")).toBe(true);
    expect(isVerifiedHref("tel:+16193243223")).toBe(true);
    expect(isVerifiedHref("tel:(619) 324-3223")).toBe(true);
  });

  it("allows same-app relative paths only", () => {
    expect(isVerifiedHref("/privacy")).toBe(true);
    expect(isVerifiedHref("//evil.example.com/path")).toBe(false);
  });

  it("rejects everything else a prompt injection could plant", () => {
    expect(isVerifiedHref("https://evil.example.com")).toBe(false);
    expect(isVerifiedHref("https://cadreai.com.evil.example.com")).toBe(false);
    expect(isVerifiedHref("http://cadreai.com/contact")).toBe(false);
    expect(isVerifiedHref("mailto:phisher@example.com")).toBe(false);
    expect(isVerifiedHref("tel:+19005551212")).toBe(false);
    expect(isVerifiedHref("javascript:alert(1)")).toBe(false);
    expect(isVerifiedHref(undefined)).toBe(false);
    expect(isVerifiedHref("")).toBe(false);
  });
});
