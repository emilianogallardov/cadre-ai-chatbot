/**
 * Deterministic action-card selector.
 *
 * ADR-004 keeps "informational actions deterministic where possible": rather
 * than trust the model to emit a card, the server derives suggested cards from
 * the turn's text with fixed rules. This keeps card copy anchored to verified
 * contact data (never model-invented URLs) and makes action selection a plain
 * unit-test surface.
 *
 * Contract (imported by the chat route):
 *   selectActionCards(userText, assistantText): ActionCard[]
 */
import { ActionCard } from "@/lib/chat/types";
import { knowledgeBase } from "@/lib/prompt/knowledge";

const { contact_url, email, phone } = knowledgeBase.verified_contacts;

/**
 * Informational intents, in priority order. The first two matches win (cards
 * are capped at 2). Each builds its copy from verified contacts only.
 */
const INTENTS: ReadonlyArray<{
  pattern: RegExp;
  card: ActionCard;
}> = [
  {
    pattern:
      /\b(book|schedul\w*|call|meet\w*|talk|speak|strategist|consult\w*|demo|get started|pricing|price|cost|charge\w*|quote)\b/i,
    card: {
      kind: "strategy_contact",
      title: "Talk with an AI strategist",
      body: `Reach Cadre at ${email} or ${phone} to talk with an AI strategist about your goals, timeline, and pricing.`,
      url: contact_url,
    },
  },
  {
    pattern: /\b(maturity|assess\w*|score|scoring|readiness|eight pillars)\b/i,
    card: {
      kind: "maturity_index",
      title: "AI Maturity Index",
      body: "Cadre assesses organizations across its eight-pillar AI transformation framework. The path to an official assessment is a conversation with a strategist.",
      url: contact_url,
    },
  },
  {
    pattern: /\b(portal|log ?in|logging in|password|account|sign ?in)\b/i,
    card: {
      kind: "portal_help",
      title: "Portal access help",
      body: `The public site does not publish login or recovery steps. Send access and account questions to Cadre support at ${email} or ${phone}.`,
      url: contact_url,
    },
  },
];

/**
 * The bot could not answer: it disclaimed knowledge. Only consulted when no
 * informational intent matched, so an on-topic answer with a card never also
 * raises an escalation. Deliberately EXCLUDES contact-offer phrasing
 * ("reach out", "recommend contacting"): the system prompt tells the model to
 * offer the contact route in healthy answers too, so those phrases signal
 * nothing — the first live-model turn proved a fully-answered question would
 * otherwise grow an escalation form.
 */
const ESCALATION_SIGNAL =
  /\b(don't have|do not have|can't|cannot|not able|no information|not published|not something i|outside)\b/i;

/**
 * The visitor explicitly asks to be contacted / followed up with. This is the
 * clearest possible escalation signal and — unlike ESCALATION_SIGNAL — it is
 * read off the USER's text, so it fires even when the model answers
 * confidently (the "Can I have someone follow up with me" turn matched no
 * informational intent AND drew a confident answer, so no card appeared).
 */
const ESCALATION_REQUEST =
  /\b(follow[ -]?up|get back to me|(contact|reach|email|message) me|have someone|be in touch|hear back|connect me (to|with))\b/i;

/**
 * The assistant's answer references the on-screen follow-up form. Mentioning
 * the form is a promise the UI must keep: if the bot says "fill in the form
 * below", the form has to be there. Detecting the mention and rendering the
 * card closes the exact defect where the bot pointed at a form that was not on
 * screen. Targets form/submission phrasing only — NOT the plain contact route
 * ("reach out to a strategist at …"), which stays cardless.
 */
const FORM_MENTION =
  /\b(follow[- ]?up request form|request form|form (just )?below|below this chat|fill (in|out) your|consent box|submit(ting)? (the|this|your) (form|request))\b/i;

const ESCALATION_CARD: ActionCard = {
  kind: "escalation",
  title: "Send your question to Cadre",
  body: "Leave your name, email, and question — it goes straight to Cadre's team. For anything urgent, hello@gocadre.ai is the fastest route.",
};

const MAX_CARDS = 2;

/**
 * Derive up to two suggested action cards for a turn. Informational intents are
 * matched on the user's text in fixed priority order. The escalation form is
 * then added when it is legitimately offered:
 *   1. the visitor explicitly asks to be contacted / followed up with, or
 *   2. the assistant's answer references the on-screen form (a mention the UI
 *      must honor), or
 *   3. (conservative fallback) the assistant disclaimed knowledge and no
 *      informational card matched.
 * Triggers 1 and 2 are explicit and fire even alongside an informational card;
 * trigger 3 stays gated on "no other card" because its signal is fuzzy. Pure
 * and deterministic; returns [] when nothing matches.
 */
export function selectActionCards(
  userText: string,
  assistantText: string,
): ActionCard[] {
  const cards: ActionCard[] = [];

  for (const { pattern, card } of INTENTS) {
    if (cards.length >= MAX_CARDS) break;
    if (pattern.test(userText)) cards.push(card);
  }

  const explicitEscalation =
    ESCALATION_REQUEST.test(userText) || FORM_MENTION.test(assistantText);
  const fallbackEscalation =
    cards.length === 0 && ESCALATION_SIGNAL.test(assistantText);
  if (
    (explicitEscalation || fallbackEscalation) &&
    cards.length < MAX_CARDS &&
    !cards.some((c) => c.kind === "escalation")
  ) {
    cards.push(ESCALATION_CARD);
  }

  return cards;
}
