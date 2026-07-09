# AI Workflow Log

Real record of delegated AI tasks: who did what, what was accepted, modified, or
rejected, and the evidence. The canonical narrative lives in
`ACTIVITY-TIMELINE.md`; this file focuses on delegation and the direct/correct
loop for the Claude Code workflow review. No retrospective or fabricated entries.

## 2026-07-09 — Phase 2 (grounded chat)

### Execution model

Fable 5 acted as the primary/orchestrating agent. Three Opus 4.8 subagents built
independent modules in parallel against interface contracts pinned by the
orchestrator before any subagent started, so the modules composed without
rework. Each subagent returned a timeline handoff (action/outcome/evidence/status)
rather than editing the timeline. The orchestrator independently re-ran the
quality gate (test/lint/typecheck), reviewed each diff, and made every commit
itself — no subagent committed.

### Parallel module build (subagents → orchestrator verify → commit)

| Subagent | Task (pinned contract) | Output | Orchestrator action |
|---|---|---|---|
| builder-prompt | Grounded system-prompt assembler over the curated KB | `src/lib/prompt/{assemble.ts,knowledge.ts}` + 12 tests | Re-ran tests, reviewed diff, committed `d795c62` |
| builder-gateway | Streaming OpenRouter client, model-as-config | `src/lib/gateway/openrouter.ts` + 15 tests; `OPENROUTER_MAX_TOKENS` in `.env.example` | Re-ran tests, reviewed diff, committed `efa62b8` |
| builder-limiter | Upstash per-IP + global daily limiter with dev fallback | `src/lib/limits/ratelimit.ts` + 11 tests; adds `@upstash/ratelimit`, `@upstash/redis` | Re-ran tests, reviewed diff, committed `3fa7cdf` |

The orchestrator then wrote the route wiring itself (not delegated): validate →
rate-limit → assemble → stream model, plus client payload normalization
(`toPayloadMessages()`) and validation hardening. Committed `3f29276`. Local
smoke: streaming 200s; per-IP limiter blocked at exactly 10/min with a friendly
429 + `Retry-After`; system-role injection rejected with 400; in-memory fallback
logged its warn-once notice.

### Adversarial review round (Codex CLI, GPT-5.5, read-only)

Codex performed an adversarial review of the full Phase 2 diff. It returned five
findings; the orchestrator adjudicated each:

- **Accepted (4):**
  1. *Critical, fail-open limiter.* The limiter (builder-limiter's original)
     failed **open** on Redis errors, suspending the budget guarantee during an
     outage. Changed to fail **closed** on Redis errors including client
     construction — an outage now denies with the same friendly 429.
  2. *Reduced-severity.* Per-message caps allowed a worst case of ~15k input
     tokens/request; at 400 req/day that could exceed the $5 budget. Added
     `LIMITS.maxTotalChars = 8000` (whole-conversation cap); worst case now ~$2/day.
  3. *Reduced-severity / injection.* Enforced strict user/assistant alternation
     that must start and end with a user turn, closing forged
     assistant-history injection at the shape level.
  4. *Contract violation* in the limiter: Upstash client construction sat
     outside the guarded path, so a malformed env could throw despite the
     module's "never throws to the caller" contract. Construction moved inside
     the guard; a construction failure now also fails closed.
- **Platform-mitigated (1):** `x-forwarded-for` spoofing for per-IP limits.
  Vercel overwrites the header at the edge, so it is not client-controllable in
  this deployment. Documented the trust model and preference for `x-real-ip`
  rather than adding code that would give false assurance elsewhere.

builder-limiter ran one fix round to apply the fail-closed + total-cap changes.
The client normalization also fixed a **pre-existing** bug: pressing Stop before
the first delta left an empty assistant message that poisoned subsequent
requests. ADR-006 was amended (fail-closed + total-cap decisions). All committed
as `ccd1fa5`.

Quality gate after the round: `npm run verify` green — 5 test files, 55/55
tests, lint, typecheck, production build.

### Accept / modify / reject summary

- **Accepted as built:** prompt assembler, gateway, and limiter module skeletons
  (all three passed independent re-verification unchanged before their commits).
- **Modified after review:** limiter (fail-open → fail-closed), request
  validation (added whole-conversation cap and strict alternation), client
  payload normalization (fixed the Stop-before-first-delta bug).
- **Rejected / declined:** the `x-forwarded-for` finding as a code change — it is
  platform-mitigated on Vercel; documented the trust model instead of writing
  code that implies a guarantee the platform already provides.

### Documentation pass

A documentation subagent (doc-agent) recorded this Phase 2 work across
`plan.md`, this log, and the planning-package rubric checklist, and drafted the
timeline entries for the orchestrator to append. It did not touch application
code or the canonical timeline.

## 2026-07-09 (afternoon) — Phase 3 (actions and escalation)

### Execution model

Same pattern as Phase 2. Fable 5 orchestrated; three Opus 4.8 subagents built
independent modules in parallel to pinned contracts; the orchestrator
independently re-verified everything, wrote the route wiring itself, and made
all commits. Codex (GPT-5.5, read-only) ran a second adversarial review; the
orchestrator adjudicated and applied every fix itself.

### Parallel module build (subagents → orchestrator verify → commit)

| Subagent | Task (pinned contract) | Output | Orchestrator action |
|---|---|---|---|
| builder-actions | Deterministic action-card selector (ADR-004) | `src/lib/actions/select.ts` + 21 tests | Re-ran tests, reviewed diff, committed `e09c3ce` |
| builder-escalation-ui | `EscalationCard` consent form → `POST /api/escalations` | consent form (name/email/question + explicit consent), reference-ID confirmation, verbatim server message + retry, session cap, accessible; 15 tests | Re-ran tests, reviewed diff, committed `31e4ab5` |
| builder-escalations | The one database write | `POST /api/escalations`: validate → limits → plain-fetch PostgREST insert (no SDK), server-stamped `consented_at`, reference ID; `StoreError` status-only; direct-contact fallback; `MemoryStore` local fallback; `checkEscalationLimit` 3/IP/day; migration `supabase/migrations/0001_escalations.sql` (ADR-005 minimal schema, RLS enabled with no policies, 30-day retention) | Re-ran tests, reviewed diff, committed `78c30aa` |

The orchestrator then wrote the route wiring itself (not delegated): the chat
route attaches `selectActionCards` output after the streamed response on both
real and mock paths, replacing the mock's hardcoded card. Committed `24c00f0`.
Smoke: booking → strategist card, portal → portal help, neutral → no card.

Design note: escalation is a consented FORM submission to a validated endpoint
(matching `data-and-storage.md`: "consented escalation fields → validated
insert"), not a model-initiated tool call — better consent UX and no PII
transcription errors. ADR-004 is satisfied via deterministic server-side card
selection plus server-side validated execution.

### Adversarial review round (Codex CLI, GPT-5.5, read-only)

Codex reviewed the full Phase 3 diff and returned seven findings; the
orchestrator adjudicated each and applied the accepted fixes itself (`8121a6a`):

- **Accepted (6):**
  1. *(High)* Escalations no longer call the chat limiter — its global counter
     guards model spend, and escalation traffic could exhaust it and block
     `/api/chat`. The 3/IP/day cap is now the route's only limiter.
  2. *(Medium)* Store requires an `https` `SUPABASE_URL` and uses
     `redirect: "error"`, so a mis-set URL fails instead of forwarding the
     service key.
  3. *(Medium)* UI in-flight ref kills the double-submit race; session cap
     persisted in `sessionStorage`.
  4. *(Low)* Migration `CHECK` constraints mirror route validation.
  5–6. Two further accepted hardening fixes applied in the same commit.
- **Declined (1):** broad intent terms (e.g. "call center automation") surfacing
  a strategist card is desirable consultancy UX, not a bug — documented rationale
  rather than narrowing the regexes.

**Directing the tool (a modify, not a blind accept):** Codex suggested placing
the escalation limiter *before* request parsing. The orchestrator reversed this
and checks the 3/day cap *after* validation, so a user's typo doesn't consume
their daily quota — a deliberate UX trade-off, documented in the fix. JSON
content-type and a 16KB content-length gate run before parsing to keep the
pre-validation surface cheap.

Codex-confirmed clean areas worth recording: no key in the client bundle; PII
absent from headers and error bodies; `consented_at` server-stamped; XSS clean
(React text rendering); streaming event order clean; RLS closed.

Quality gate after the round: `npm run verify` green — 10 test files, 112/112
tests, lint, typecheck, production build.

### Accept / modify / reject summary

- **Accepted as built:** action selector, escalation UI, and escalation store
  module skeletons (all passed independent re-verification before their commits).
- **Modified after review:** escalation route decoupled from the chat limiter;
  https/redirect hardening on the store; double-submit + persisted session cap on
  the UI; limiter placement moved *after* validation against Codex's suggestion.
- **Rejected / declined:** narrowing the intent regexes — broad-term strategist
  cards are intended consultancy UX; documented instead of changed.
