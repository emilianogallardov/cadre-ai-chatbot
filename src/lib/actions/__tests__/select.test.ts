import { describe, expect, it } from "vitest";
import { knowledgeBase } from "@/lib/prompt/knowledge";
import { selectActionCards } from "../select";

const { contact_url, email, phone } = knowledgeBase.verified_contacts;

describe("selectActionCards", () => {
  it("matches strategy_contact on booking/strategist intent", () => {
    const cards = selectActionCards("book me with an AI strategist", "");
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("strategy_contact");
    expect(cards[0].title).toBe("Talk with an AI strategist");
    expect(cards[0].url).toBe(contact_url);
    expect(cards[0].body).toContain(email);
    expect(cards[0].body).toContain(phone);
  });

  it("matches strategy_contact on pricing terms", () => {
    const cards = selectActionCards(
      "How much does a six-month engagement cost?",
      "",
    );
    expect(cards.map((c) => c.kind)).toEqual(["strategy_contact"]);
  });

  it.each([
    "Can you book me with an AI strategist tomorrow afternoon?",
    "I'd like to schedule a call",
    "who can I speak to about a consultation",
    "what's the price of a demo",
    "What would Cadre charge us for a six-month engagement?",
  ])("routes %j to strategy_contact", (userText) => {
    expect(selectActionCards(userText, "")[0].kind).toBe("strategy_contact");
  });

  it("matches maturity_index on assessment/scoring intent", () => {
    const cards = selectActionCards("score my company", "");
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("maturity_index");
    expect(cards[0].title).toBe("AI Maturity Index");
    expect(cards[0].url).toBe(contact_url);
  });

  it.each([
    "What is the AI Maturity Index?",
    "how do you assess readiness",
    "explain the eight pillars",
  ])("routes %j to maturity_index", (userText) => {
    expect(selectActionCards(userText, "")[0].kind).toBe("maturity_index");
  });

  it("matches portal_help on portal/account intent", () => {
    const cards = selectActionCards("I forgot my portal password", "");
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("portal_help");
    expect(cards[0].title).toBe("Portal access help");
    expect(cards[0].url).toBe(contact_url);
    expect(cards[0].body).toContain(email);
  });

  it.each([
    "how do I log in to my account",
    "I can't sign in",
    "reset my password please",
  ])("routes %j to portal_help", (userText) => {
    expect(selectActionCards(userText, "")[0].kind).toBe("portal_help");
  });

  it("offers escalation only when the assistant could not answer", () => {
    const cards = selectActionCards(
      "Who won the 2026 World Cup?",
      "That's outside what I can help with, but I can point you to Cadre.",
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("escalation");
    expect(cards[0].title).toBe("Send your question to Cadre");
    expect(cards[0].url).toBeUndefined();
  });

  it("does not escalate when the assistant answered normally", () => {
    const cards = selectActionCards(
      "Who won the 2026 World Cup?",
      "Cadre AI is an AI strategy consultancy focused on adoption.",
    );
    expect(cards).toEqual([]);
  });

  it("does not escalate on a healthy answer that offers the contact route", () => {
    // Regression from the first live-model turn: the system prompt makes the
    // model close good answers with a contact offer; that phrasing must not
    // read as "could not answer".
    const cards = selectActionCards(
      "Do you work with construction companies?",
      "Yes, Cadre publishes dedicated experience with construction. If you'd " +
        "like to explore fit, reach out to an AI strategist at " +
        "https://www.cadreai.com/contact.",
    );
    expect(cards).toEqual([]);
  });

  it("prefers an informational card over escalation", () => {
    // Assistant text carries an escalation signal, but the user asked for
    // something informational — the informational card wins and no escalation
    // is added.
    const cards = selectActionCards(
      "can I book a strategist",
      "I don't have your account details.",
    );
    expect(cards.map((c) => c.kind)).toEqual(["strategy_contact"]);
  });

  it("caps at two cards in priority order", () => {
    const cards = selectActionCards(
      "book a strategist to assess my portal login",
      "",
    );
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.kind)).toEqual([
      "strategy_contact",
      "maturity_index",
    ]);
  });

  it("returns [] when nothing matches", () => {
    expect(selectActionCards("hello there", "Hi, how can I help?")).toEqual([]);
  });

  it("is case-insensitive and deterministic", () => {
    const a = selectActionCards("BOOK A STRATEGIST", "");
    const b = selectActionCards("book a strategist", "");
    expect(a).toEqual(b);
    expect(a[0].kind).toBe("strategy_contact");
  });

  it("uses the verified contact_url for every card that carries a url", () => {
    const userTexts = [
      "book a strategist",
      "score my company",
      "forgot my portal password",
    ];
    for (const text of userTexts) {
      for (const card of selectActionCards(text, "")) {
        if (card.url !== undefined) expect(card.url).toBe(contact_url);
      }
    }
  });
});
