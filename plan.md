# Cadre AI Support Concierge — Implementation Plan

Goal: ship a publicly deployed Cadre AI support chatbot that handles the six
evaluated scenarios with grounded answers, explicit boundaries, and a verified
human-contact path. Submission target: Friday morning, 2026-07-10, at least one
business day before the review.

Status legend: `[ ]` pending · `[x]` done and verified · `[~]` in progress.
This file is updated when reality diverges; the append-only history lives in
`ACTIVITY-TIMELINE.md`.

## In scope

- Responsive streaming text chat (canonical experience)
- Curated Cadre knowledge with sources (`data/curated/knowledge-base.json`)
- Typed actions: strategy contact, Maturity Index path, portal help, escalation
- Real consented escalation persistence (Supabase, minimal schema, 30-day retention)
- Unknown-answer, provider-error, and rate-limit handling as designed UI states
- Public Vercel deployment with Upstash rate/spend protection
- Optional browser voice (Web Speech API) only after text scenarios pass
- Scenario regression, unit, and live smoke tests

## Explicitly out of scope (each cut has an ADR)

- Authentication or a portal replica (ADR-002) — no scenario needs identity;
  cutting it removes a half-day of invented scope
- Persistent chat history (ADR-002) — privacy obligations without user benefit
- Vector DB / RAG (ADR-001) — curated corpus is ~12 entries; retrieval adds
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

- [ ] Request schema validation (roles, count, length) before any provider call
- [ ] OpenRouter model gateway (server-only; provider config isolated)
- [ ] Prompt assembler: system policy + curated KB + bounded recent turns
- [ ] Upstash rate limiter wired ahead of model spend (ADR-006)
- [ ] Streaming with abort/retry; provider errors become typed, friendly states
- [ ] Model benchmark across 3 candidates; record results in ADR-007; select model

Exit: factual scenarios pass against the live model within budget caps.

## Phase 3: Actions and escalation

- [ ] Typed informational actions: `show_strategy_contact`,
      `show_maturity_index_path`, `show_portal_help` (deterministic cards)
- [ ] Unknown-answer path: state the limitation, offer verified contact
- [ ] `create_escalation`: consent + validation → Supabase insert (server-only)
      → reference ID; direct-contact fallback on failure
- [ ] Per-session escalation cap + limiter coverage for the mutating route

Exit: pricing, booking, portal, and unknown questions all behave safely.

## Phase 4: Voice and polish

- [ ] Feature-detected speech input (Web Speech API); hidden when unsupported
- [ ] Opt-in speech output; never autoplay
- [ ] Full text fallback verified with voice unavailable
- [ ] Responsive, keyboard, loading, empty, and error states finished

Exit: voice adds value without becoming a dependency.

## Phase 5: Verification and submission (Friday AM)

- [ ] Scenario regression suite automated (all six + boundary prompts)
- [ ] Lint, typecheck, unit tests, production build all pass
- [ ] Secret scan: repo history and client bundle
- [ ] Live smoke test: six scenarios on the deployed URL, clean browser, mobile
- [ ] README finalized: setup, env names, architecture, scope cuts, limitations
- [ ] Push to fresh GitHub repo; verify reviewer access
- [ ] Submit via Gem link; repository URL in the Notes field; save confirmation

Exit: every completion claim has evidence; no changes after submission without
a documented reason.
