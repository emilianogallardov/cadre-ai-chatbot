/**
 * Typed re-export of the curated knowledge base.
 *
 * The prompt assembler is the model's only knowledge source (CLAUDE.md: "The
 * model receives only the curated knowledge layer, never raw site crawl"). This
 * module gives that JSON a compile-time shape so assemble.ts stays declarative.
 */
import raw from "../../../data/curated/knowledge-base.json";

export interface KnowledgePolicy {
  answer_only_from_entries: boolean;
  pricing: string;
  portal: string;
  security: string;
  unknown: string;
}

export interface VerifiedContacts {
  contact_url: string;
  email: string;
  phone: string;
}

export interface KnowledgeEntry {
  id: string;
  topic: string;
  approved_answer: string;
  keywords: string[];
  sources: string[];
}

export interface KnowledgeBase {
  schema_version: string;
  reviewed_at: string;
  policy: KnowledgePolicy;
  verified_contacts: VerifiedContacts;
  entries: KnowledgeEntry[];
}

export const knowledgeBase: KnowledgeBase = raw;
