# AGENTS.md — Cadre AI Support Concierge

Canonical agent instructions for every coding agent (the open AGENTS.md
standard). `CLAUDE.md` imports this file via `@AGENTS.md` — edit here only.

## Product

A public customer-support chatbot for Cadre AI (AI strategy consultancy). It
answers common inbound questions from a curated, sourced knowledge base and
routes unsupported or client-specific requests to a verified human-contact
path. Text chat is canonical; browser voice is progressive enhancement.

## Non-negotiable boundaries

- Do not add authentication, RAG, or a portal replica without a new accepted
  ADR (`docs/decisions/`). Conversation storage exists and is governed by
  ADR-008: never weaken its privacy artifacts (notice at collection, honest
  private mode, delete control, enforced retention) without amending that ADR,
  and any change to what is stored must update the privacy page AND the
  `assistant-data-practices` KB entry in the same commit — the bot must never
  misstate its own data practices.
- Do not invent pricing, portal URLs, calendar bookings, security
  certifications, client facts, or guaranteed outcomes — in code, prompts, or
  bot copy. The knowledge policy in `data/curated/knowledge-base.json` governs.
- The model receives only the curated knowledge layer, never raw site crawl.
- Action cards are selected deterministically server-side from the turn's
  text (ADR-004) — never model-emitted; card URLs come only from verified
  contacts.
- Secrets (OpenRouter, Supabase, Upstash, conversation signing) are
  server-only environment variables. Never in client code, git, logs, or the
  timeline.
- Every model-spending route sits behind the rate limiter (ADR-006,
  fail-closed).
- Text chat must remain fully functional when voice is unavailable.

## Source of truth

- Activity timeline (append-only): `ACTIVITY-TIMELINE.md`
- Timeline protocol: `docs/process/timeline-protocol.md`
- Plan and scope: `plan.md`
- Product design: `docs/plans/2026-07-08-cadre-support-agent-design.md`
- Decisions: `docs/decisions/` (ADR-001 … ADR-008)
- Curated knowledge: `data/curated/knowledge-base.json`
- Scenario coverage / regression prompts: `data/curated/scenario-coverage.md`

If implementation and documentation disagree, stop and resolve the decision —
update the ADR or plan first; never silently change scope.

## Required workflow

1. Read the latest `ACTIVITY-TIMELINE.md` entry and the next unchecked
   `plan.md` item before starting.
2. Inspect git status and the relevant files before editing.
3. Keep changes small enough to verify and explain; commit atomically with
   descriptive messages.
4. Run targeted tests, then the quality gate, before claiming completion.
5. Review every diff for secrets, accidental scope, and generated clutter.
6. Append verified outcomes to the timeline per the protocol; update `plan.md`,
   ADRs, and the rubric checklist when affected.

Do not report a material task complete until its timeline entry includes
evidence.

## Commands

```bash
npm run dev          # local dev server
npm run lint         # ESLint, zero errors required
npm run typecheck    # tsc --noEmit
npm run test         # unit + scenario tests (Vitest)
npm run build        # production build
npm run verify       # full quality gate: lint + typecheck + test + build
```

(If a command does not exist yet at the current phase, creating it is part of
the phase — do not fake results.)

## Architecture rules

- UI components never import provider SDKs or database clients.
- `lib/gateway/` owns all OpenRouter-specific configuration; swapping models is
  a config change.
- Prompt assembly (`lib/prompt/`) is separate from request handling
  (`app/api/`).
- Validation is hand-rolled, typed TypeScript at every route boundary (no
  schema library). Mutations are server-side only: the consented escalation
  lead write, the post-stream conversation write, and the signed-token
  conversation delete — each behind its own validation and limits.
- Knowledge entries retain source URLs and a review date.
- Provider, rate-limit, and validation failures map to typed, user-safe
  responses — never raw errors to the client.

## Subagent use

Delegate only independent, bounded work (fact verification, accessibility
review, prompt-boundary attacks, deployed smoke tests). Give each subagent
exact files, success criteria, and expected verification. Subagents return a
timeline handoff (action/outcome/evidence/status) to the primary agent — they
never edit `ACTIVITY-TIMELINE.md` directly. Record real delegations in
`docs/ai-workflow-log.md`; never fabricate one.

## Completion checks

- Six brief scenarios pass on the deployed URL (see scenario-coverage.md).
- Boundary prompts (pricing, portal recovery, booking claims, security
  guarantees, injection) pass.
- `npm run verify` passes; live smoke test passes in a clean browser.
- No secrets in git history or the client bundle.
- README, plan, ADRs, and known limitations match the actual application.
