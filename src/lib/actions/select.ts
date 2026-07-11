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

const ESCALATION_CARD: ActionCard = {
  kind: "escalation",
  title: "Send your question to Cadre",
  body: "Leave your name, email, and question — it goes straight to Cadre's team. For anything urgent, hello@gocadre.ai is the fastest route.",
};

const MAX_CARDS = 2;

/**
 * Derive up to two suggested action cards for a turn. Intent is matched on the
 * user's text in fixed priority order; escalation is a fallback offered only
 * when nothing informational matched and the assistant signalled it could not
 * answer. Returns [] when nothing matches. Pure and deterministic.
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

  if (cards.length === 0 && ESCALATION_SIGNAL.test(assistantText)) {
    cards.push(ESCALATION_CARD);
  }

  return cards;
}
