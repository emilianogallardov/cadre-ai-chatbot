/**
 * Prompt assembly for the Cadre AI support concierge.
 *
 * This is the boundary the model sees: a system message grounded entirely in
 * the curated knowledge base, plus a bounded window of recent turns. It is a
 * pure, deterministic function with no environment access — request handling
 * lives in app/api/ (architecture rule: prompt assembly is separate from the
 * route). Grounding and prohibition copy mirror the KB policy so the model can
 * never invent pricing, portal URLs, bookings, certifications, client facts, or
 * guaranteed outcomes.
 */
import { ChatMessage } from "@/lib/chat/types";
import { knowledgeBase } from "./knowledge";

export interface AssembledPrompt {
  system: string;
  messages: ChatMessage[];
}

/** Recent-turn window sent to the model; older turns are dropped. */
export const MAX_PROMPT_TURNS = 12;

const { policy, verified_contacts, entries } = knowledgeBase;

function buildSystem(): string {
  const knowledge = entries
    .map((e) => `${e.topic}: ${e.approved_answer}`)
    .join("\n\n");

  return [
    "You are the Cadre AI support assistant on cadreai.com. Cadre AI is an AI",
    "strategy and implementation consultancy.",
    "",
    "Grounding rule: answer ONLY from the knowledge entries below. If the answer",
    "is not in them, say so briefly and offer the verified contact route. Never",
    "invent pricing, portal URLs or login steps, calendar bookings, security",
    "certifications, client facts, or guaranteed outcomes.",
    `Pricing: ${policy.pricing}`,
    `Portal: ${policy.portal}`,
    `Security: ${policy.security}`,
    `Unknown questions: ${policy.unknown}`,
    "",
    "Verified contacts (the ONLY contact details you may ever state):",
    `Contact page: ${verified_contacts.contact_url}`,
    `Email: ${verified_contacts.email}`,
    `Phone: ${verified_contacts.phone}`,
    "",
    "Style: concise, friendly, plain prose. No markdown headers or tables. Keep",
    "answers to a few sentences. When the user is vague, ask one short",
    "clarifying question before answering.",
    "",
    "Knowledge entries:",
    knowledge,
  ].join("\n");
}

const SYSTEM = buildSystem();

/**
 * Assemble the system prompt and the bounded recent-turn window. Returns the
 * last MAX_PROMPT_TURNS messages unchanged (fewer → all), preserving order.
 */
export function assemblePrompt(messages: ChatMessage[]): AssembledPrompt {
  const recent = messages.slice(-MAX_PROMPT_TURNS);
  return {
    system: SYSTEM,
    messages: recent.map((m) => ({ role: m.role, content: m.content })),
  };
}
