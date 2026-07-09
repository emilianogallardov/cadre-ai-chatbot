import { describe, expect, it } from "vitest";
import { validateEscalation, ValidationError } from "../validate";

const valid = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  question: "Do you work with manufacturing teams?",
  consent: true,
};

describe("validateEscalation", () => {
  it("accepts a valid submission and normalizes name/email/question", () => {
    const result = validateEscalation({
      name: "  Ada Lovelace  ",
      email: "  Ada@Example.COM ",
      question: "  Do you help with strategy?  ",
      consent: true,
    });
    expect(result).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      question: "Do you help with strategy?",
      consent: true,
    });
  });

  it("rejects non-object bodies", () => {
    expect(() => validateEscalation(null)).toThrow(ValidationError);
    expect(() => validateEscalation("nope")).toThrow(ValidationError);
    expect(() => validateEscalation(undefined)).toThrow(ValidationError);
  });

  it("rejects missing or empty name", () => {
    expect(() => validateEscalation({ ...valid, name: undefined })).toThrow(
      /name/,
    );
    expect(() => validateEscalation({ ...valid, name: "   " })).toThrow(/name/);
  });

  it("rejects an oversized name", () => {
    expect(() =>
      validateEscalation({ ...valid, name: "x".repeat(101) }),
    ).toThrow(/name/);
  });

  it("rejects malformed email shapes", () => {
    const bad = [
      "plainaddress",
      "no-at-sign.com",
      "two@@at.com",
      "space in@email.com",
      "trailing@dot.",
      "missing@tld",
      "a@b.c", // TLD shorter than two chars
      "@nolocal.com",
      "spaces@ domain.com",
    ];
    for (const email of bad) {
      expect(() => validateEscalation({ ...valid, email }), email).toThrow(
        /email/,
      );
    }
  });

  it("rejects an oversized email even if otherwise shaped correctly", () => {
    const email = "a".repeat(250) + "@example.com";
    expect(() => validateEscalation({ ...valid, email })).toThrow(/email/);
  });

  it("rejects missing, empty, or oversized question", () => {
    expect(() =>
      validateEscalation({ ...valid, question: undefined }),
    ).toThrow(/question/);
    expect(() => validateEscalation({ ...valid, question: "   " })).toThrow(
      /question/,
    );
    expect(() =>
      validateEscalation({ ...valid, question: "x".repeat(2001) }),
    ).toThrow(/question/);
  });

  it("requires consent to be the literal boolean true", () => {
    expect(() => validateEscalation({ ...valid, consent: false })).toThrow(
      /consent/,
    );
    expect(() => validateEscalation({ ...valid, consent: undefined })).toThrow(
      /consent/,
    );
    // A truthy string must not pass — consent is an explicit opt-in.
    expect(() =>
      validateEscalation({ ...valid, consent: "true" }),
    ).toThrow(/consent/);
    expect(() => validateEscalation({ ...valid, consent: 1 })).toThrow(
      /consent/,
    );
  });
});
