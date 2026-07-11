# Codex round 11 — pre-submission buttoned-up audit (GPT-5.6 Sol)

- Trigger: owner asked for a final "everything buttoned" sweep before the Gem
  submission, run alongside a three-model blind instruction-discovery panel
  (Haiku / Sonnet / Opus — see the T-062 timeline entry).
- Scope given: instruction-file coherence after the T-059 AGENTS.md swap, doc
  consistency, timeline integrity, repo hygiene, submission optics. Explicitly
  NOT a re-review of application code.
- Verdict: **FIX-FIRST — 3 HIGH / 3 MED / 2 LOW**, no product-code findings.
  All repo-side items fixed the same hour; the remaining HIGH is the
  user-gated Upstash provisioning already on the submission checklist.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | HIGH | Production rate limiter still per-instance memory; ADR-006 requires Redis in prod | Known and user-gated: Upstash provisioning is submission step 1; /api/health honestly reports "degraded" until then |
| 2 | HIGH | README + SCALING said "all three models pass the substance bar, GPT excluded only on latency" — but the FINAL 2026-07-11 benchmark shows gpt-5-mini at 5/10 substance | Both corrected: Haiku and Sonnet pass 10/10; gpt-5-mini failed substance AND the 3s latency gate. The stale text described the earlier run |
| 3 | HIGH | Fresh typecheck failed on macOS-duplicated `.next/types/* 2.ts` artifacts (ignored, not committed — same class as a prior incident) | `.next` cleared, `npm run verify` re-run: 26 files / 295 tests / clean build, exit 0 |
| 4 | MED | requirements-verification.md stale: D3 described CLAUDE.md as canonical, 287 tests, timeline "through T-055"; plan.md said "Friday AM" and mobile pass outstanding | All refreshed: D3 records the T-059 swap, 295 tests with the growth trail, timeline enumerated through T-061; plan.md dated correctly and mobile marked done (T-061), leaving mic/clean-browser as the manual steps |
| 5 | MED | AGENTS.md and timeline-protocol.md mandated updating a `RUBRIC-CHECKLIST.md` that never existed in this repo (external planning-package artifact) | Both reworded: rubric checklist labeled external with a pointer to its one-time audit in docs/verification/ |
| 6 | MED | README overstated the knowledge boundary ("cannot leak facts it was never given" — a pretrained model can still draw on prior knowledge) and used a stale corpus size (~3.5KB vs the measured 9.6KB JSON) | Reworded to the defensible claim: raw crawl never enters context; answers constrained to the curated layer by grounding rules that are test-pinned and live-measured (`npm run quality`); size corrected |
| 7 | LOW | Migration residue: two src comments cited "CLAUDE.md architecture rules"; AGENTS.md used root-relative shorthands (`lib/gateway/`) for paths that live under `src/` | Comments updated to AGENTS.md; paths corrected to `src/…` |
| 8 | LOW | Scaffold residue: stock `next.config.ts` placeholder comment, five unreferenced default Next/Vercel SVGs in public/, default favicon | SVGs deleted (nothing referenced them), config comment made intentional. Favicon left as-is — inventing Cadre branding was judged worse than the default; flagged to the owner as optional |

## Cross-checks with the blind three-model panel (same hour)

Sonnet's blind agent independently found #5 (the rubric-checklist ghost) and
#7 (the src comment residue) — two auditors with different methods converging
on the same findings raises confidence the sweep is near-exhaustive. Opus's
skeptical-reviewer pass surfaced the one non-fixable observation: the process
footprint (38 docs, 11 review rounds, 70KB timeline) will itself be the first
thing a reviewer reacts to — an interview-prep point, not a repo change.

## Evidence

codex-round11-buttoned-up.log (session records, 133k tokens); fresh
`npm run verify` 26 files / 295 tests exit 0 after `.next` clear; commit
follows with the T-062 timeline entry.
