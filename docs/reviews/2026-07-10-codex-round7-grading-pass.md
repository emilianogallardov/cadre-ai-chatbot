# Codex round 7 — full-repo grading pass (GPT-5.6 Sol)

- Trigger: the owner asked "what is the grade of this project now and does it
  handle all things a chatbot should handle" — a fresh full-repo GRADING pass
  (not an increment review) at `7be467e`, after the round-6 session-wall and
  scaling work landed.
- Verdict: **8.3/10 — "strong senior take-home and a credible hire signal"**
  (up from 6.5 at round 3 and 7.4/7.7 at round 5). No new core-runtime
  blocker found comparable to the earlier SSE, EOF, or long-session bugs.
  "Comfortably submission-worthy" once the submission-day key/infra steps
  and the round-6 deployment evidence land.

## Per-area grades

| Area | Grade | Sol's one-line assessment |
|---|---|---|
| Product correctness & safety boundaries | A- | Curated grounding, deterministic actions, verified-link rendering, bounded context, conservative failure behavior |
| Engineering quality | A- | Clean separation, typed user-safe errors, 273 tests incl. route sequencing, stream failures, endurance, adversarial regressions |
| Security & spend protection | B+ | Server-only secrets and bounded spend, but deployed limiter still per-instance; 400-cap worst case exceeds $5 on all-Sonnet fallback |
| Privacy engineering | A- | Notice, server-enforced Private mode, signed deletion, RLS, real scheduled retention — not policy-only promises |
| Documentation & decision honesty | A- | "Exceptional" ADRs and correction trail; a few present-tense claims contradicted the final cost math |
| Scaling & operational readiness | B+ | Bounded rolling context + guarded load harness strong; durable coordination, monitoring, and live proof of round 6 incomplete |

## The four "would embarrass the author live" residuals — all fixed same hour

| # | Finding | Resolution (commit `b4797fd` + T-052) |
|---|---|---|
| 1 | Round 6 not proven live — timeline ended "pending prod deploy + smoke" with no closing entry, while plan.md claimed complete | The deploy/smoke had actually happened but was unrecorded; T-052 now carries the evidence (windowed 8-exchange payload streamed live where the pre-fix client died on the 8000-char cap) |
| 2 | Three-way spend-story contradiction: verification doc ~$2/day vs ADR-006 ~$5–6 vs SCALING.md's derived $7.86 all-Sonnet worst case | All surfaces unified on SCALING.md §2a as canonical; exhaustion-not-overspend stated honestly (prepaid credit is the hard stop, but the demo key can still be drained) |
| 3 | The Private-mode TOOLTIP still carried the round-2 overclaim ("Cadre won't save this chat") — the third copy surface for this promise | Tooltip now reads "Private mode — new messages aren't saved"; tooltips are copy too |
| 4 | ADR-006 overclaimed that strict alternation "closes the forged assistant-history channel" — alternation rejects malformed shape, not fabricated provenance | Rescoped to shape-level with the real containment named (system prompt, deterministic server-side actions, link allowlist) |

## Also produced in this round

The owner's "does it handle everything a deployed chatbot should" question
was answered against a researched external yardstick, not our own rubric:
the reusable `deployed-chatbot-requirements` skill (10 domains mapped to
OWASP LLM Top 10 2025 + WCAG/NN-g UX baselines, verification method per
item, 14 field anti-patterns) — this bot audited against it. Open items were
operations-tier (CI, observability, feedback affordance), which round 8's
increment then partially closed (CI + health endpoint).

- Evidence: `codex-round7-grade.log` (session records, 149K tokens);
  timeline T-052; `npm run verify` green post-fixes; deploy + live smoke in
  session records.
