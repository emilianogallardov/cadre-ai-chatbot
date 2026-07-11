# ADR-008: Conversation Storage with Private Mode

- Status: Accepted
- Date: 2026-07-10
- Supersedes: the "no persistent transcripts" half of ADR-002 (the no-auth half
  stands)

## Context

ADR-002 rejected anonymous persistent conversations as "privacy and retention
obligations without helping the user." Two things changed after the first real
production conversations:

1. **Escalation context.** A consented lead whose conversation is attached is
   worth multiples of a bare "call me back" — the Cadre team sees exactly what
   the visitor asked and what the bot answered before following up.
2. **Content-gap signal.** What visitors ask that the knowledge base cannot
   answer is precisely what Cadre should publish next.

The product owner decided: store conversations by default with clear notice
and a user-facing private mode. A Codex adversarial design review ran BEFORE
this ADR was written; all 13 findings were accepted as design inputs
(`docs/reviews/2026-07-10-codex-adr008-design-review.md`).

## Decision

Store chat turns in Supabase, default-on, governed by five privacy artifacts
that make every claim true by construction:

1. **`/privacy` page** — CalOPPA already applies to this site (the escalation
   form collects name+email), so the page closes an existing gap, not just a
   new one. It discloses: data collected (chat text, conversation id,
   escalation fields, IP for abuse prevention), purposes, processors (Vercel,
   OpenRouter/model providers, Supabase, Upstash), 30-day automated retention,
   user controls, deletion contact, no sale/sharing, DNT statement, effective
   date.
2. **Notice at collection** — a persistent line under the composer, visible
   before the first keystroke: chats are saved, don't share sensitive info,
   links to Privacy and Private mode.
3. **Private mode** — a toggle that stops Cadre's transcript writes. Honest
   scope: messages are still processed by the model gateway to generate
   replies; the copy never claims "no storage anywhere." An escalation
   submitted while private is still stored (it is explicitly consented) with
   `conversation_id` null.
4. **Delete this chat** — while the session's signed token exists, one click
   cascade-deletes the conversation. After the tab closes there is no handle
   (no accounts — deliberate); the privacy page's contact path covers late
   deletion requests.
5. **Enforced retention** — a `pg_cron` job deletes conversations and
   escalations older than 30 days. The previous comment-only "30-day
   retention" claim on escalations is retrofitted with the same mechanism.

### Mechanics

- **Identity of a conversation**: server-minted UUID, HMAC-signed with
  `CONVERSATION_SIGNING_SECRET`, returned to the client in a new NDJSON
  `conversation` event on the first turn and echoed back on later turns.
  Signature verification means ids cannot be forged to pollute or probe other
  conversations; invalid tokens are silently treated as "new conversation,"
  never an error.
- **Write point**: after the model stream completes, inside Next.js `after()`
  (platform-supported post-response work — fire-and-forget on Vercel is
  otherwise droppable). One idempotent conversation upsert + the user and
  assistant turns, deduplicated by a client-supplied per-send `turnId` under a
  unique index. A storage failure logs a status code only and never affects
  the chat response.
- **Escalation linking**: the escalation route verifies the token and upserts
  the conversation row before inserting the lead, eliminating the race with
  the post-stream write.
- **Schema**: `NOT NULL` throughout, `ON DELETE CASCADE`, length caps on
  content, role CHECK, indexes on the delete/query paths. RLS enabled with
  zero policies — reads and writes happen only through the server with the
  secret key; proven live (anon read `[]`, anon insert 401).
- **Bot self-description**: the knowledge base is updated in the same change
  so the bot accurately describes storage, private mode, deletion, and the
  escalation flow (reference shown on screen; no confirmation email exists).
  An assistant that misstates its own data practices is a deceptive-practices
  problem, not a UX bug.
- **Degradation**: without `SUPABASE_URL`/`SUPABASE_SECRET_KEY`/
  `CONVERSATION_SIGNING_SECRET`, storage silently disables; chat is untouched.

## Alternatives considered

1. **Opt-in banner** — most visitors ignore banners; the escalation-context
   feature would mostly die. Rejected.
2. **Store only on escalation** — smallest privacy surface, keeps lead
   context, but zero content-gap signal from everyone else. Rejected by the
   product owner in favor of default-on with notice + private mode.
3. **Raw transcripts replaced by intent analytics** — lower PII risk, but
   loses the lead-context feature entirely. The intent counts remain a cheap
   future addition on top of stored turns.

## Consequences

- The app now has real data-protection obligations, met by construction:
  notice at collection, deletion control, enforced retention, truthful copy.
- Anonymous visitors remain unlinkable to identity unless they volunteer
  name+email through the consented form.
- No cookies, trackers, or analytics scripts were added — no cookie banner is
  required.
- Production steps documented, not faked: legal review of the policy text,
  self-service deletion beyond the session, redacted/aggregated analytics
  views.

## Revisit when

Cadre wants analytics dashboards or redacted transcript review tooling; a
data-subject request arrives that the manual contact path cannot serve; or
the bot starts handling account-specific data (which would trigger ADR-002's
auth half as well).

## Amendment 2026-07-11 (notice placement)

Requirement 2 originally specified a *persistent* line under the composer. In
the mobile rework the disclosure was scoped to the first-run screen
(`items.length === 0`) and hidden while the on-screen keyboard is up, because a
persistent composer line collided with the keyboard on small viewports. The
obligation is preserved: the notice is shown on the first-run screen — the
at-or-before-collection moment, since collection begins with the first sent
message — and the Privacy link plus the Private-mode toggle remain persistent
in the header for the whole session; every New chat returns to that first-run
screen. Recorded here because AGENTS.md requires an ADR amendment before a
privacy artifact is scoped.

## Amendment 2026-07-11 (New chat keeps the deletion handle)

"New chat" clears the visible transcript and the model context but deliberately
**keeps** the conversation's signed token, so the Delete control can still
reach the stored record. An earlier version dropped the token to mint a fresh
server conversation, which stranded the prior conversation with no client-side
delete handle — a break of the self-service deletion contract above. The stored
record now continues under the same id (a longer transcript is acceptable) and
stays deletable.
