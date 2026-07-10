# Codex design review — ADR-008 (conversation storage + private mode)

- Date: 2026-07-10 (pre-build design review, before ADR-008 was written)
- Reviewer: Codex CLI (GPT-5.5, read-only), full design context front-loaded
- Scope: data model + flow section of the proposed conversation-storage design,
  with explicit instruction to check privacy/data-protection requirements
  (CCPA/CPRA, CalOPPA, retention, deletion) and design flaws
- Outcome: 13 findings — **all 13 accepted** (2 reduced in scope), adjudicated
  below. This review ran before any code was written; every acceptance is a
  design input, not a retrofit.

## Findings and adjudication

| # | Sev | Finding | Adjudication |
|---|-----|---------|--------------|
| 1 | Critical | One-line disclosure insufficient; CalOPPA already applies (site collects name/email via escalations) and CCPA notice-at-collection needs categories, purposes, retention, contact | **Accept.** Add a public `/privacy` page (what is collected: chat text, conversation id, escalation fields, IP for rate limiting; purposes; processors: Vercel, OpenRouter/model providers, Supabase, Upstash; 30-day retention; deletion contact; no sale/sharing) plus the just-in-time notice near the composer linking to it |
| 2 | Critical | "Private mode disables all storage" is false — messages still transit Vercel/OpenRouter and rate limiting stores IP-derived state | **Accept.** Copy: private mode prevents *Cadre from saving the chat transcript*; messages are still processed to generate replies. ADR documents vendor processing |
| 3 | Critical | A table comment is not retention — claiming 30 days without a deletion job would be called out | **Accept.** Implement real retention: `pg_cron` scheduled job deleting conversations (cascade to messages) older than 30 days; retrofit the same job for escalations, which had the identical comment-only posture |
| 4 | High | Bare client-generated conversation UUID is forgeable (analytics pollution, junk attachment to known ids) | **Accept.** Server issues the conversation id with an HMAC signature (server secret) on the first turn; later turns and escalation linking require a validly signed token; unsigned/invalid ids are ignored, never an error |
| 5 | High | Escalation link races the post-stream background write (FK failure / lead pointing at missing row) | **Accept.** Conversation row is an idempotent upsert on both routes: chat (post-stream) and escalations (before lead insert) |
| 6 | High | Fire-and-forget writes can be dropped when the Vercel function ends | **Accept.** Use Next.js `after()` so the write is a platform-supported post-response task |
| 7 | High | Anonymous users lose their only deletion handle when the tab closes | **Accept (reduced).** "Delete this chat" control while the signed token exists (`DELETE /api/conversations`, cascade); after tab close, deletion path is the privacy-page contact using the escalation reference. Full self-service deletion beyond the session is a documented production step |
| 8 | High | Private mode + consented escalation is ambiguous ("skips every write" conflicts with the form) | **Accept.** Explicit wording + tests: private mode skips transcript rows only; a consented escalation submission is still stored, with `conversation_id` null |
| 9 | Medium | Raw transcripts invite pasted PII | **Accept.** Notice copy includes "please don't share sensitive information"; stored content length-capped on both roles |
| 10 | Medium | Schema lacks operational constraints | **Accept.** `NOT NULL` throughout, `ON DELETE CASCADE`, indexes on `messages(conversation_id, created_at)`, `conversations(last_message_at)`, `escalations(conversation_id)` |
| 11 | Medium | Client retries can duplicate stored turns | **Accept.** Client sends a per-turn `turnId`; unique index `(conversation_id, turn_id, role)` + upsert-ignore |
| 12 | Medium | RLS posture needs proof, not assertion | **Accept.** Same live proof as escalations: anon read returns `[]`, anon insert 401, recorded in the timeline |
| 13 | Low | "Industry norm" framing reads as hand-waving | **Accept.** ADR frames default-on storage as a product decision backed by notice, private mode, retention job, and deletion control |

## What the review confirmed was already right

Server-only Supabase access with RLS-and-zero-policies; consent-gated
escalation storage; validation + rate limiting in front of every write;
per-tab sessionStorage as the conversation boundary; storing only the final
user/assistant turn per request rather than re-writing history.

---

# Round 2: implementation review (post-build, same day)

- Scope: full ADR-008 implementation diff (26 files), /privacy page, KB entry
- Verdict returned: **fix-then-ship** — 8 findings, all 8 accepted (one
  partially, with a documented residual)

| # | Sev | Finding | Resolution |
|---|-----|---------|------------|
| 1 | High | Delete can race the post-response store; cards emitted before the token could leave a first-turn escalation unlinked | **Accepted (partial).** `conversation` event now precedes action cards on both paths; Delete is disabled while a stream is in flight (the human-reachable race). Residual: a network-level delete beating an in-flight `after()` write by milliseconds is accepted for this exercise — closing it needs a tombstone table, named as the production step |
| 2 | High | Private mode silently lost when sessionStorage is blocked (catch blocks referenced a fallback that didn't exist) | **Accepted.** In-memory mirror is now the read source of truth; sessionStorage is best-effort persistence; tests cover throwing storage |
| 3 | Med | Mid-chat Private toggle copy overclaimed ("isn't saving this chat" while earlier turns stay saved) | **Accepted.** Copy now says "new messages aren't being saved"; privacy page spells out that pre-toggle turns stay until Delete this chat |
| 4 | Med | Escalation linking bumped `last_message_at`, silently extending transcript retention | **Accepted.** `linkConversation` switched to ignore-duplicates (row created if missing, untouched if present); test asserts the header |
| 5 | Med | Per-send turnId regeneration defeated dedup on user retry | **Accepted.** The pending logical turn keeps its turnId across retries of the same text; cleared on successful completion |
| 6 | Low | "Deleted after 30 days" stricter than a daily-job reality (~31 days worst case) | **Accepted.** Copy: "a daily job deletes records once they are older than 30 days" (privacy page + KB) |
| 7 | Low | cron.schedule not idempotent on re-apply | **Accepted.** Unschedule-first DO block; proven by re-applying the migration to the live project — job count stayed at exactly 2 |
| 8 | Low | KB said the assistant "remembers earlier messages in this chat" while the prompt window is 12 turns | **Accepted.** "uses recent messages in the current chat" |

Design findings #4, #6, #9, #10, #12, #13 confirmed met by round 2; the
half-met ones (#2, #3, #5, #7, #11) are closed by the fixes above. No
server-secret or PII leak found in either round.
