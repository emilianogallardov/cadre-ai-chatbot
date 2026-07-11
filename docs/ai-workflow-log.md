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
     `LIMITS.maxTotalChars = 8000` (whole-conversation cap); worst case then estimated ~$2/day (superseded by docs/SCALING.md $2a: ~$2.62 Haiku / ~$7.86 all-Sonnet at the 400 cap).
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

## Phase 6 — conversation storage design (2026-07-10, pre-build)

- **Trigger:** product-owner decision to flip ADR-002 (store conversations by
  default with notice + private mode) after seeing live-model behavior; new
  timeline (submit Saturday, hard deadline Monday, presentation Tuesday).
- **Codex (GPT-5.5, read-only) as design reviewer, before any code:** the full
  design section (data model, flow, privacy posture) was front-loaded into a
  stateless review with explicit privacy/data-requirements instructions.
  13 findings returned; **all 13 accepted** (2 reduced in scope) — unusual for
  this project's reviews, and a direct consequence of reviewing a design
  instead of a diff: every acceptance became a build input rather than a
  retrofit. Full adjudication:
  `docs/reviews/2026-07-10-codex-adr008-design-review.md`.
- **Live-transcript audit as design input:** the owner's first real prod
  conversation (11 turns) was audited turn-by-turn; its three findings
  (escalation-card over-firing, KB self-description staleness under ADR-008,
  phantom confirmation-email implication) were folded into the same build
  scope.

## Phase 6 — UI-polish workstream (2026-07-10, parallel to conv-client)

- **Isolation pattern:** the polish workstream ran in its own git worktree off
  committed main because the shared checkout held the conv-client builder's
  uncommitted files — branch discipline without blocking either side. Rebase
  onto the landed client work produced exactly one conflict (the header both
  workstreams touched), resolved by design: the new single-line header's
  control row was built with slots for the Private/Delete controls it had
  never seen.
- **Extract-then-test:** the one piece of scroll logic with edge cases
  (stick-or-release decision, 40px threshold, rubber-band overscroll,
  non-overflowing content) was extracted to a pure helper and unit-tested;
  the DOM wiring around it stayed thin.
- **Live verification over trust:** stick/no-yank behavior was measured in a
  real browser (scrollTop instrumentation during real streaming), the pill
  was driven keyboard-only, and the escalation-card suppression was proven in
  both directions — flag set vs. cleared on equivalent prompts — rather than
  accepting the ambiguous single negative result the first attempt produced.
  The first suppression "test" was also caught selecting the wrong form's
  submit button; the fix (scope the selector to the composer) is why the
  positive control existed at all.

## Phase 6 — premium UI pass via cross-model design review (2026-07-10)

- **Codex (GPT-5.6, read-only) as design reviewer before styling:** rather than
  styling by instinct, the owner's "more premium" ask was front-loaded into a
  constraint-rich review (no new deps, no palette change, don't touch
  aria/scroll/storage, 375px must hold). Codex's diagnosis — flatness from
  every region living on one plane — reframed the work as surface hierarchy
  and framing instead of animation, and its DO-NOT list (React Bits, Framer,
  particles, glow, new accent colors) killed the deadline-risky directions
  before any code was written. All 8 ranked recommendations landed in one
  commit (`741ac06`), CSS/Tailwind only.
- **Concurrent-agent seam handling:** the review pass collided with the other
  workstream mid-edit twice — a react-hooks lint error in their uncommitted
  composer draft logic (fixed via render-time state adjustment so the shared
  gate stayed green) and their verifiedLinks sanitizer defined but not yet
  wired into the markdown render (wired in, and the new file was included in
  the commit so main stayed self-consistent).

## Round-3 full-repo review with GPT-5.6 Sol (2026-07-10)

- **Frontier-model refresh as a review event:** GPT-5.6 Sol went GA the day
  before submission; pointing the strongest available reviewer at the whole
  repo (prior Codex rounds were scoped to ADR-008) cost one prompt and found
  what two earlier reviews missed — the SSE parser swallowed OpenRouter's
  mid-stream error payloads, letting a provider failure masquerade as a
  successful answer complete with action cards and storage.
- **Adjudicate, don't obey:** all 14 findings were re-verified against the
  code before acting. Two of Sol's "fresh gate failed" signals were artifacts
  of its own read-only sandbox (stale `.next` Finder duplicates, no network)
  and were discounted with reasons; three test-rigor findings were deferred
  with documented reasoning rather than churning the benchmark the day before
  submission. 9 of 14 fixed within the hour, 13 new regression tests.
- **Two agents, one file, no worktree:** the premium-UI session and this
  review pass edited Chat.tsx/Composer.tsx concurrently. The seam held by
  sequencing (server-side fixes while the UI session owned the components,
  then reconciling), and the UI session folded the orchestrator's logic edits
  into its commit — verified by grepping the committed blob before building
  on top of it.

## Spec-first hardening loop (2026-07-10, evening)

- **Specs as contracts, in-repo:** both improvement tracks were written as
  pinned specs (docs/specs/) before any builder ran — required case IDs,
  mandated mock seams, hard "do not touch product code" rules, and explicit
  never-run-the-benchmark spend protection. The builders' handoffs are
  auditable against those files, not against intent remembered later.
- **Parallel Opus builders on disjoint file sets:** route tests and the
  benchmark selector share nothing, so both ran concurrently with no
  worktree. The orchestrator re-verified each against its spec before any
  review — including confirming all 25 case IDs and that the metered
  benchmark was never executed.
- **Review loop until closed:** Codex (GPT-5.6 Sol) returned FIX-THEN-ACCEPT
  with the two highest-value catches being tests that would pass with a
  broken product: membership-not-sequence assertions on the NDJSON stream,
  and a "bad token" case that failed at syntax before ever exercising HMAC
  verification. After fixes, a confirmation pass verified each finding
  individually CLOSED (one comment-numbering nit surfaced and fixed) —
  the loop ended at accept, not at "probably fine".

## Round 6 — the owner's product questions beat adversarial review (2026-07-10 night)

- **"How long can a session run?" found a HIGH five review rounds missed:**
  reviewers (and tests) checked requests; nobody checked a session's
  evolution. The client re-sent the whole transcript every turn into a
  server that caps total chars — normal conversations died around turn
  10-12. The fix inverts the contract: the client sends a rolling window
  that is valid by construction, pinned by an invariant test and a
  50-exchange endurance test through the real route.
- **Measurement over assertion:** a spend-guarded, dependency-free load
  harness plus docs/SCALING.md, with every cost figure derived from the
  benchmark report's own recorded prices (cross-checked to six decimals)
  and every load number from actual runs — including one where the
  reviewer's confirmation pass caught our fix to its own finding being
  incomplete (a `done` event could mask an earlier `error`).
- **Spend safety as a first-class tool feature:** "localhost" is not "free"
  when `.env.local` holds a real key — the tool preflights the target and
  refuses to fan out against anything that doesn't answer with the keyless
  mock, proven functionally in both directions before shipping.

## Rounds 7-8 — grading pass + polish increment review (2026-07-10 late night)

- **A grade is a review artifact too:** round 7 was a fresh full-repo
  GRADING pass (8.3/10, per-area A-/B+ table) rather than a finding hunt —
  and its four "would embarrass the author live" residuals were all
  claims-vs-reality drift, not code bugs: an unrecorded deploy, a three-way
  spend-story contradiction, a tooltip carrying a promise round 2
  supposedly removed, and an ADR overclaim. Honest documentation needs the
  same adversarial loop as code (docs/reviews/2026-07-10-codex-round7-grading-pass.md).
- **Even the polish increment earned its pass:** round 8 caught a dark-mode
  contrast regression INSIDE the accessibility fix, two real buttons the
  new 44px rule missed, and a CI "no secrets" claim that wasn't literally
  true (GitHub's auto-minted job token, persisted by default). All six
  findings closed same hour; the loop's value held at the smallest
  increment size (docs/reviews/2026-07-10-codex-round8-increment-review.md).
- **External yardstick over self-grading:** the owner's "does it handle
  everything a deployed chatbot should" was answered by building a
  researched requirements skill (OWASP LLM Top 10 2025 + WCAG/NN-g
  baselines) and auditing this bot against it — the remaining opens were
  operations-tier and are documented as triggers, not silently absent.

## Round 9 — the focused UI-layer lens (2026-07-11, pre-submission)

- **A consolidated review of merged work is not redundant with the reviews
  of its increments:** rounds 3-8 read every one of these files, but only a
  UI-scoped prompt ("hunt interaction-state races, rendering safety,
  accessibility correctness") surfaced the delete/send race (HIGH — a send
  during the pending DELETE recreates the conversation the user just
  deleted) and the markdown image-gating hole (`![x](url)` fetched from
  arbitrary hosts while anchors were carefully whitelisted). Review scope is
  a search strategy, not a formality.
- **The orchestrator pre-reads before the reviewer returns:** re-reading the
  files while Codex ran independently surfaced one of its findings (the
  dark-mode eyebrow) in advance — cheap validation that the reviewer and
  the adjudicator are looking at the same reality.
- **Docs debts get paid before they compound:** rounds 7-8 had timeline
  entries but no review records; both were backfilled from the session logs
  BEFORE round 9 ran, so the review series stays uniformly evidenced
  (docs/reviews/ now has one record per round).

## Round 10 — from "is it correct?" to "is it useful?" (2026-07-11, pre-submission)

- **The owner's question changed the review axis:** ten rounds had asked
  whether the code is right; "are we answering in a way that is useful and
  builds trust?" made the 120 stored live messages the artifact under
  review. Codex read them against the KB while the orchestrator did an
  independent pass — they converged on the CTA treadmill and split usefully:
  the orchestrator caught persona drift, Codex caught the worse one,
  synthesis overreach (KB facts recombined into unpublished capability
  claims for a logistics prospect).
- **Root causes were in the prompt, not the model:** an unconditional
  "offer the verified contact route" instruction, no voice rule at all, and
  a stale no-markdown style rule the model had learned to ignore. All fixed
  as prompt text with the rules pinned by unit tests.
- **Measure, don't vibe:** a new live harness (scripts/quality-metrics.ts)
  scripted 12 turns with per-turn contact-expectation labels. Baseline
  reproduced every defect (contact in 9/12 replies, 5 on grounded turns,
  synthesis overreach); the enforced after-run gates on the aggregate of two
  runs (single-run rates at n=12 flap at thresholds — observed, then
  designed around) with the safety-adjacent synthesis probe required to pass
  EVERY run. Final: 10/24 contact, 1 grounded violation, 0 voice, 0
  synthesis failures.
- **The gate caught its own author twice:** the first cooldown wording was
  logically disjunctive (legitimate routing turns kept restating contacts —
  rewritten to (a-or-b)-AND-not-visible), and the regression benchmark
  caught the "vary your phrasing" instruction producing clean injection
  deflections the refusal cluster missed (third occurrence of this
  false-negative class; cluster broadened, shapes pinned, haiku back to
  10/10 with the same selection).
- **Evidence discipline also got reviewed:** round 10's Part A tightened the
  T-056 write-up itself — claims scoped to what one uncontrolled run shows,
  chronology corrected from stored-row timestamps, the raw latency series
  preserved in the report, quantile method labeled.
