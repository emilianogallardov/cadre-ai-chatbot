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
