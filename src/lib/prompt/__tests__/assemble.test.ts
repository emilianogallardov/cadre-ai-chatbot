import { describe, expect, it } from "vitest";
import { ChatMessage } from "@/lib/chat/types";
import { assemblePrompt, MAX_PROMPT_TURNS } from "../assemble";
import { knowledgeBase } from "../knowledge";

describe("assemblePrompt system prompt", () => {
  const { system } = assemblePrompt([{ role: "user", content: "hi" }]);

  it("identifies the assistant and Cadre AI", () => {
    expect(system).toContain("Cadre AI support assistant on cadreai.com");
    expect(system).toContain(
      "AI strategy and implementation consultancy",
    );
  });

  it("states the grounding rule", () => {
    expect(system).toContain("answer ONLY from the knowledge entries");
    expect(system).toMatch(/if the answer\s+is not in them/i);
  });

  it("carries the invention prohibitions", () => {
    expect(system).toContain("Never");
    expect(system).toContain("invent pricing");
    expect(system).toContain("portal URLs");
    expect(system).toContain("calendar bookings");
    expect(system).toContain("security");
    expect(system).toContain("guaranteed outcomes");
  });

  it("includes all three verified contact values and nothing invented", () => {
    expect(system).toContain(knowledgeBase.verified_contacts.contact_url);
    expect(system).toContain(knowledgeBase.verified_contacts.email);
    expect(system).toContain(knowledgeBase.verified_contacts.phone);
  });

  it("renders every knowledge entry as topic: approved_answer", () => {
    for (const entry of knowledgeBase.entries) {
      expect(system).toContain(`${entry.topic}: ${entry.approved_answer}`);
    }
  });

  it("omits non-contact source URLs from the prompt", () => {
    // The verified contact_url is intentionally present and overlaps a couple
    // of entry sources; every other source URL must stay out of the prompt.
    const contactUrl = knowledgeBase.verified_contacts.contact_url;
    for (const entry of knowledgeBase.entries) {
      for (const source of entry.sources) {
        if (contactUrl.includes(source)) continue;
        expect(system).not.toContain(source);
      }
    }
  });

  it("instructs concise prose with a clarifying question", () => {
    expect(system).toMatch(/concise/i);
    expect(system).toMatch(/clarifying question/i);
  });

  // Spec: docs/specs/2026-07-11-answer-quality-voice-and-cta.md — the rules
  // that fix the T-056 live-transcript findings, pinned so a future prompt
  // edit can't silently drop them.

  it("pins the voice register: first-person assistant, Cadre in third person", () => {
    expect(system).toMatch(/first person \('I'\)/);
    expect(system).toMatch(/Cadre in the\s+third person/);
    expect(system).toMatch(/Never say 'we', 'our', or 'us' meaning Cadre/);
  });

  it("conditions contact details instead of offering them unconditionally", () => {
    // The old unconditional instruction is gone…
    expect(system).not.toContain("say so briefly and offer the verified contact route");
    // …replaced by (a-or-b) AND not-already-visible. The conjunction matters:
    // a disjunctive first draft let legitimate routing turns restate contacts
    // back-to-back (caught by the quality-metrics enforcement run).
    expect(system).toMatch(/ONLY when \(a\) the user asks/);
    expect(system).toMatch(/\(b\) you cannot answer/);
    expect(system).toMatch(/AND, in either case, only if the details are not already visible/);
  });

  it("forbids synthesizing entries into new Cadre claims", () => {
    expect(system).toMatch(/Do not combine separate knowledge entries/);
    expect(system).toMatch(/never stated as a Cadre example, capability, or outcome/);
  });

  it("breaks the reply formulas: conditional closing question, varied openings", () => {
    expect(system).toMatch(/follow-up\s+question only when/);
    expect(system).toMatch(/not on\s+every reply/);
    expect(system).toMatch(/do not reuse the same scaffold/);
  });

  it("allows light markdown but still bans headers and tables", () => {
    expect(system).toMatch(/Light markdown is fine/);
    expect(system).toMatch(/no headers or tables/);
  });
});

describe("assemblePrompt message window", () => {
  function conversation(n: number): ChatMessage[] {
    return Array.from({ length: n }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `message ${i}`,
    }));
  }

  it("passes through conversations at or under the bound unchanged", () => {
    const input = conversation(MAX_PROMPT_TURNS);
    const { messages } = assemblePrompt(input);
    expect(messages).toEqual(input);
  });

  it("passes short conversations through identically", () => {
    const input = conversation(3);
    const { messages } = assemblePrompt(input);
    expect(messages).toEqual(input);
    expect(messages).toHaveLength(3);
  });

  it("keeps only the last MAX_PROMPT_TURNS, preserving order", () => {
    const input = conversation(30);
    const { messages } = assemblePrompt(input);
    expect(messages).toHaveLength(MAX_PROMPT_TURNS);
    expect(messages).toEqual(input.slice(-MAX_PROMPT_TURNS));
    expect(messages[0].content).toBe("message 18");
    expect(messages[MAX_PROMPT_TURNS - 1].content).toBe("message 29");
  });

  it("handles an empty conversation", () => {
    const { messages } = assemblePrompt([]);
    expect(messages).toEqual([]);
  });
});

describe("assemblePrompt determinism", () => {
  it("returns deep-equal output across calls", () => {
    const input = [
      { role: "user" as const, content: "What does Cadre do?" },
      { role: "assistant" as const, content: "It is a consultancy." },
    ];
    expect(assemblePrompt(input)).toEqual(assemblePrompt(input));
  });
});
