# Cadre AI Support Concierge — Implementation Plan

Goal: ship a publicly deployed Cadre AI support chatbot that handles the six
evaluated scenarios with grounded answers, explicit boundaries, and a verified
human-contact path. Submission target: Saturday 2026-07-11 (hard deadline
Monday 2026-07-13; live review Tuesday morning 2026-07-14) — updated from the
original Friday target when the owner added ADR-008 scope on 2026-07-10.

Status legend: `[ ]` pending · `[x]` done and verified · `[~]` in progress.
This file is updated when reality diverges; the append-only history lives in
`ACTIVITY-TIMELINE.md`.

## In scope

- Responsive streaming text chat (canonical experience)
- Curated Cadre knowledge with sources (`data/curated/knowledge-base.json`)
- Typed actions: strategy contact, Maturity Index path, portal help, escalation
- Real consented escalation persistence (Supabase, minimal schema, 30-day retention)
- Conversation storage with privacy by construction (ADR-008, added 2026-07-10):
  notice at collection, /privacy page, honest private mode, delete-this-chat,
  pg_cron-enforced retention, signed conversation ids, escalation-lead linking
- Unknown-answer, provider-error, and rate-limit handling as designed UI states
- Public Vercel deployment with Upstash rate/spend protection
- Optional browser voice (Web Speech API) only after text scenarios pass
- Scenario regression, unit, and live smoke tests

## Explicitly out of scope (each cut has an ADR)

- Authentication or a portal replica (ADR-002) — no scenario needs identity;
  cutting it removes a half-day of invented scope
- ~~Persistent chat history (ADR-002)~~ — SUPERSEDED 2026-07-10 by ADR-008:
  the owner reversed this cut for escalation-lead context and content-gap
  signal, with the privacy obligations met by construction rather than avoided
- Vector DB / RAG (ADR-001) — curated corpus is 14 entries; retrieval adds
  latency and failure modes with zero recall benefit at this size
- Unverified calendar/portal integrations — no public scheduler or login URL
  exists; inventing one would fabricate product surface
- Realtime voice architecture (ADR-003) — separate architecture, disproportionate
- CRM integration, analytics dashboard, staff notification — production concerns
  with no take-home evidence value

## With more time (triggers, not a wish list)

- RAG over articles/case studies — when users need deep article search or the
  KB outgrows the prompt budget
- Auth + client-aware answers — when the bot must access real portal data
- Managed realtime voice (LiveKit/OpenAI Realtime) — when voice becomes a
  required channel, not an enhancement
- CRM handoff for escalations — when Cadre defines schema, consent, ownership

## Resolved decisions (Phase 0)

- [x] Model: benchmark 3 candidates, cheapest that passes all checks (ADR-007)
- [x] Rate limiting: Upstash Redis per-IP + global daily cap (ADR-006)
- [x] Escalation: real Supabase rows, minimal schema, 30-day retention (ADR-005)
- [x] Scheduling URL: none verified publicly → use cadreai.com/contact
- [x] Portal URL: none verified publicly → route account questions to support
- [x] Voice browsers: Chrome-first Web Speech API; feature-detected, text fallback

## Phase 0: Repo, docs, and safeguards

- [x] Fresh repository with curated knowledge + docs from planning package
- [x] ADR-005 accepted; ADR-006 and ADR-007 recorded
- [x] Root `plan.md` and `CLAUDE.md` adapted to the real project
- [x] `.env.example` with names only; `.gitignore` verified before any key exists locally
- [x] Initial docs commit (`e1d642a`)

Exit: decisions documented; zero secrets in the repository.

## Phase 1: Shell and early deployment

- [x] Scaffold Next.js (App Router, TypeScript, Tailwind, ESLint) + test runner (`a4a0115`)
- [x] Minimal accessible chat layout: transcript live region, composer,
      suggested prompts from scenario coverage (`779ca5a`)
- [x] Mock streaming endpoint (no provider call) (`779ca5a`)
- [x] Deploy to Vercel; smoke-test the public URL — https://cadre-ai-chatbot.vercel.app (T-025)
- [x] Commit(s): scaffold, chat shell, deploy config

Exit: a working mock chat is live on the public URL — day 1.

## Phase 2: Grounded chat

- [x] Request schema validation (roles, count, length) before any provider call
      (`779ca5a` base + `ccd1fa5` hardening: strict user/assistant alternation, `maxTotalChars` cap)
- [x] OpenRouter model gateway (server-only; provider config isolated) (`efa62b8`)
- [x] Prompt assembler: system policy + curated KB + bounded recent turns (`d795c62`)
- [x] Upstash rate limiter wired ahead of model spend (ADR-006) (`3fa7cdf` + `ccd1fa5`
      fail-closed; wired in `3f29276`. Durable Redis still needs Vercel env vars —
      permissive in-memory fallback is live in prod until they are provisioned)
- [x] Streaming with abort/retry; provider errors become typed, friendly states
      (`efa62b8` gateway + `3f29276` route; client stop/retry normalized in `ccd1fa5`)
- [x] Model benchmark across 3 candidates; record results in ADR-007; select model
      (`7a43d53`: all 3 passed the original leak-only checks 10/10;
      responsiveness gate added openly post-results; selected claude-haiku-4.5,
      fallback claude-sonnet-4.5. 2026-07-11 re-run under strengthened
      substance assertions reconfirmed the pick — both Claude models 10/10,
      cost floor excluded on substance and latency; ADR-007 addenda +
      docs/benchmarks/2026-07-11 report)

Exit: factual scenarios pass against the live model within budget caps.

## Phase 3: Actions and escalation

- [x] Typed informational actions: `show_strategy_contact`,
      `show_maturity_index_path`, `show_portal_help` (deterministic cards)
      (`e09c3ce` selector; `24c00f0` route attaches cards after the stream)
- [x] Unknown-answer path: state the limitation, offer verified contact
      (`e09c3ce`: escalation card only when no action matched and the assistant
      signalled it could not answer)
- [x] `create_escalation`: consent + validation → Supabase insert (server-only)
      → reference ID; direct-contact fallback on failure (`78c30aa` server write +
      `31e4ab5` consent-form UI + `8121a6a` hardening. Prod ran on the
      in-memory `MemoryStore` until Supabase env vars were provisioned in
      Phase 6; production now writes durable Supabase rows, and an
      unconfigured production store fails into the direct-contact fallback
      instead of faking success)
- [x] Per-session escalation cap + limiter coverage for the mutating route
      (`31e4ab5`/`8121a6a` sessionStorage cap + `78c30aa`/`8121a6a`
      `checkEscalationLimit` 3/IP/day, fail-closed, checked after validation)

Exit: pricing, booking, portal, and unknown questions all behave safely.

## Phase 4: Voice and polish

- [x] Feature-detected speech input (Web Speech API); hidden when unsupported
      (`680f7ad`; interim preview, never auto-sends)
- [x] Opt-in speech output; never autoplay (`680f7ad`; off by default, speaks
      once on stream completion, cancelled by new input/Stop)
- [x] Full text fallback verified with voice unavailable (`680f7ad`; SSR HTML
      carries no voice controls; unsupported browsers render the identical
      text experience. Real-mic Chrome smoke remains a manual step)
- [x] Responsive, keyboard, loading, empty, and error states finished
      (T-043: single-line header + control row, stick-to-bottom scrolling with
      accessible "↓ Latest" pill and reduced-motion support, post-submission
      escalation-card suppression, focus-visible states everywhere; verified
      in-browser at 375px-emulated and desktop widths plus a keyboard-only
      pass; 189/189 tests)

Exit: voice adds value without becoming a dependency.

## Phase 5: Verification and submission (Friday AM)

- [x] Scenario regression suite automated (all six + boundary prompts) —
      benchmark harness through the production code path, plus a 9-case live
      regression against the deployed URL with the real model (T-040)
- [x] Lint, typecheck, unit tests, production build all pass (12 files,
      130/130, T-040)
- [x] Secret scan: repo history and client bundle (0 hits each, T-040)
- [x] Live smoke test: six scenarios + boundaries on the deployed URL with the
      live model (T-040; mobile/clean-browser pass is the remaining manual
      user step)
- [x] README finalized: setup, env names, architecture, scope cuts,
      limitations (`28d9297`, T-038)
- [x] Push to fresh GitHub repo; verify reviewer access (public; anonymous
      fetch returns 200, T-040)
- [ ] Submit via Gem link; repository URL in the Notes field; save confirmation

Exit: every completion claim has evidence; no changes after submission without
a documented reason.

## Phase 6: Conversation storage + privacy (owner-added scope, 2026-07-10)

- [x] ADR-008 accepted; Codex adversarial DESIGN review before any build
      (13/13 findings accepted as inputs) (T-041, `80d6335`)
- [x] Signed conversation tokens, PostgREST store, migration with RLS +
      pg_cron retention (builder subagents to pinned contracts; orchestrator
      re-verified and committed) (T-042, `ebd3f28`)
- [x] Server seams: after() turn writes, DELETE route, escalation linking,
      /privacy page, KB truth-update (T-042, `dc4ee99`)
- [x] Client plumbing: notice at collection, Private toggle, Delete chat,
      token echo (T-042/T-044 fixes, `10ab4fb`)
- [x] Codex IMPLEMENTATION review round 2 — 8/8 findings accepted and closed
      (T-044, `1ebdfa3`)
- [x] Cloud migration applied + proven: RLS anon probes, cron jobs, re-apply
      idempotency; full storage lifecycle E2E local AND prod (T-042/T-044)
- [x] Post-ADR-008 live regression on prod: 6 scenarios + boundaries +
      privacy self-description + private-mode + common inquiries (T-046,
      docs/verification/2026-07-10-requirements-verification.md)

Exit: every privacy claim is enforced in code and the bot describes its own
practices accurately on the live site.
