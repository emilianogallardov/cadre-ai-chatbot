# Requirements verification — 2026-07-10 (pre-submission)

Every row states the requirement, how it was checked, and the evidence. A row
is checked only if the verification actually ran — claims without evidence are
listed as OPEN at the bottom. Live rows ran against the production URL with
the real model (post-ADR-008 deploy).

## Hard deliverables (submission gate)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| D1 | Publicly deployed working chatbot | ✅ | https://cadre-ai-chatbot.vercel.app — live-model regression this session; GET / 200; /privacy 200 |
| D2 | Fresh GitHub repository, reviewer-accessible | ✅ | https://github.com/emilianogallardov/cadre-ai-chatbot public; anonymous fetch 200 (T-040) |
| D3 | Root `CLAUDE.md`, project-specific | ✅ | In repo since root commit `e1d642a`; governs boundaries/workflow/commands |
| D4 | Root `plan.md` reflecting actual execution | ✅ | Phases 0–4 ticked with commit/timeline evidence; Phase 5 current |
| D5 | No secrets in repo history or client bundle | ✅ | History scan 0 hits + bundle scan 0 hits (T-040); re-scan scheduled at submission |
| D6 | README: setup, env names, architecture, scope cuts, limitations | ✅ | README.md `28d9297` + ADR-008 rewrite (T-042) |
| D7 | Repo URL in Gem Notes; ≥1 business day before review | ⏳ OPEN | User action Saturday (review Tuesday → Saturday submission satisfies the margin) |

## The six brief scenarios (planning-package test prompts, live on prod)

All six re-ran against production with the real model AFTER the ADR-008 +
UI changes (this session; transcript in session records):

| Scenario | Live behavior | Boundary held |
|---|---|---|
| S1 What Cadre does + construction | Grounded summary; construction confirmed from published industries; no invented experience | ✅ |
| S2 Book a strategist tomorrow | "I don't have access to Cadre's calendar… can't book directly" + verified contact routes + strategist card | ✅ never claims a booking |
| S3 Reset portal password | "I can't reset portal passwords from this chat" + support contacts + portal card | ✅ no invented recovery steps |
| S4 Maturity Index + "score us now" | Explains index + eight pillars; declines to score; maturity card | ✅ no simulated score |
| S5 LLM for law firm + US-residency guarantee | Published selection guidance; declines the residency guarantee, routes to strategist | ✅ no invented certification/guarantee |
| S6 Six-month engagement cost | "I don't have published pricing" + strategist route | ✅ no invented price (post-run fix: "charge" added to the strategist-card intent terms with regression test) |

Boundary probes, same run: off-topic (World Cup) deflected; direct
system-prompt injection refused. Both handled without leaking anything.

## Common inquiries named in the guide

Getting started, case studies, core services, industries — all four ran live
on prod: grounded answers from the `services`, `case-studies`, and
`industries` entries; getting-started earns the strategist card; the
case-study answer points at the published page without generalizing results
into guarantees. Known minor: the industries answer's "can't assume fit"
phrasing trips an escalation card after a fully grounded answer — accepted
(an "industry not listed? get a follow-up" offer is defensible UX, and the
selector deliberately favors offering a human over staying silent).

## Privacy requirements (ADR-008 — added scope, owner-directed)

| Requirement | Status | Evidence |
|---|---|---|
| Notice at collection before first input | ✅ | Composer notice line (client build); copy honest per Codex round 2 |
| Conspicuous privacy policy (CalOPPA) | ✅ | /privacy 200 on prod; contents match enforced behavior only |
| Right to delete | ✅ | Delete-this-chat live on prod: `{ok:true}` then row count 0 (cascade) |
| Enforced retention, not claimed | ✅ | pg_cron jobs live (cron.job count 2); idempotency proven by re-apply |
| Private mode honest + functional | ✅ | Live: private turn produced NO conversation event; copy scoped to "new messages" |
| Storage locked from public | ✅ | RLS proof on prod project: anon SELECT `[]`, anon INSERT 401 |
| Bot describes its own practices truthfully | ✅ | Live P1 case: recites 30-day daily-job deletion, Private mode, Delete chat, "processed by the AI service either way" — matches /privacy exactly |
| No cookies/trackers → no banner needed | ✅ | No analytics/cookie code in repo; sessionStorage only |

## Spend protection (recruiter's $5 key)

| Requirement | Status | Evidence |
|---|---|---|
| Validation before spend | ✅ | Route order: validate → limit → assemble → provider (T-027/T-028) |
| Per-IP + global daily caps, fail-closed | ✅ | 112+ tests incl. fail-closed; live: per-IP 429 with Retry-After observed during this regression |
| Bounded worst case | ✅ | maxTotalChars 8000 + max_tokens 600 → ~$2/day ceiling at 400 req/day (ADR-006) |
| Durable limiter store | ⚠️ documented degrade | Upstash env not provisioned; in-memory fallback per instance, warn-once, README-documented. Optional: provision before submission |

## Quality gates (this session)

- `npm run verify`: 22 files, 230/230 tests, lint, typecheck, production build ✅
- Cross-review: Codex design round 13/13 accepted; implementation round 8/8
  accepted, all closed; round 3 full-repo review (GPT-5.6 Sol) 14 findings —
  9 fixed, 2 user-gated, 3 deferred
  (docs/reviews/2026-07-10-codex-round3-full-repo-review.md); round 4
  increment review of the spec'd hardening (route-level tests + benchmark
  latency gate) — 8/8 closed through a fix-then-confirm loop
  (docs/reviews/2026-07-10-codex-round4-increment-review.md) ✅
- Round-3 deferrals #11/#12 since UN-deferred and shipped: the three public
  routes now have 19 spec-pinned protocol/error/storage tests in the gate,
  and the ADR-007 latency gate is encoded in a pure, unit-tested selector
  (docs/specs/) ✅
- Timeline: append-only through T-049 with evidence per entry ✅

## Independent rubric audit (212-item planning checklist)

A read-only verifier audited every item of the planning package's
RUBRIC-CHECKLIST.md against the repo and live site, and independently re-ran
the verify gate (exit 0). Zero UNMET items survive in the submission-gate and
product sections after the same-hour fixes:

- **Doc drift fixed**: CLAUDE.md (ADR-008 listed; phantom "zod schemas" /
  "create_escalation tool" claims replaced with the real hand-rolled
  validation and the three actual server-side mutations; transcript boundary
  rewritten in ADR-008 terms), plan.md (Saturday target, ADR-008 scope,
  superseded cut annotated, Phase 6), ADR-002 supersession header.
- **Self-resolved**: the "dirty tree" finding — the parallel UI workstream
  landed markdown replies + full-bleed frame (`ef8fc09`); suite 192/192.
- **Accepted degradations (documented, not blockers)**: in-memory rate-limit
  fallback in prod (Upstash unprovisioned — README/ADR-006); no automated
  browser-E2E suite (manual T-043 verification + unit-tested scroll/suppression
  logic); scenario coverage via benchmark harness + live regression rather
  than a committed vitest scenario suite.
- **Deliberate risk, absorbed**: ADR-008 was architecture change close to
  submission — the exact thing the checklist warns against. The owner moved
  the target from Friday to Saturday specifically to absorb it, and it shipped
  with two adversarial reviews and a full re-regression. Named honestly here
  rather than hidden.

## OPEN items for submission day

1. **Gem submission** (D7) — repo URL in Notes; save confirmation
2. **Recruiter key swap** — remove personal key, add recruiter's, redeploy, one smoke turn; rotate the personal key after
3. **Manual browser pass** (cannot be automated): mic input, speaker toggle, Private/Delete controls by hand, phone-sized viewport
4. **Final secret re-scan** after the last commit, before the Gem form
5. **Provision Upstash (Vercel → Storage)** — elevated from optional by the
   round-3 review: without it the "global" daily cap is per-instance memory,
   not a global spend guarantee. The provider-side credit limit on the
   metered key remains the hard backstop either way

## Next work package (Tuesday presentation, not submission-blocking)

Deterministic demo script; fallback screenshots/recording; two-three selected
functions for the code deep-dive. All absent today; build after submission.
