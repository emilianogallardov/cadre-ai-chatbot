import { describe, expect, it } from "vitest";
import {
  canSubmit,
  GENERIC_FAILURE,
  outcomeFromResponse,
  type EscalationFields,
} from "../EscalationCard";

const complete: EscalationFields = {
  name: "Ada",
  email: "ada@example.com",
  question: "Do you work with logistics teams?",
  consent: true,
};

describe("canSubmit", () => {
  it("passes when all fields are non-empty and consent is checked", () => {
    expect(canSubmit(complete)).toBe(true);
  });

  it("requires consent", () => {
    expect(canSubmit({ ...complete, consent: false })).toBe(false);
  });

  it.each(["name", "email", "question"] as const)(
    "requires a non-blank %s",
    (field) => {
      expect(canSubmit({ ...complete, [field]: "" })).toBe(false);
      expect(canSubmit({ ...complete, [field]: "   " })).toBe(false);
    },
  );
});

describe("outcomeFromResponse", () => {
  it("maps a successful body to a confirmation with the reference id", () => {
    expect(outcomeFromResponse({ ok: true, referenceId: "ESC-42" })).toEqual({
      status: "confirmed",
      referenceId: "ESC-42",
    });
  });

  it("surfaces the server's user-safe failure message verbatim", () => {
    const message = "You've sent too many requests. Try again in a minute.";
    expect(
      outcomeFromResponse({ ok: false, code: "rate_limited", message }),
    ).toEqual({ status: "error", message });
  });

  it("falls back to generic contact text on a successful body missing an id", () => {
    expect(outcomeFromResponse({ ok: true })).toEqual({
      status: "error",
      message: GENERIC_FAILURE,
    });
  });

  it("falls back to generic text on a failure body missing a message", () => {
    expect(outcomeFromResponse({ ok: false, code: "store_failed" })).toEqual({
      status: "error",
      message: GENERIC_FAILURE,
    });
  });

  it.each([null, undefined, "not json", 42, {}, { ok: "yes" }])(
    "falls back to generic text on malformed body %s",
    (body) => {
      expect(outcomeFromResponse(body)).toEqual({
        status: "error",
        message: GENERIC_FAILURE,
      });
    },
  );
});
