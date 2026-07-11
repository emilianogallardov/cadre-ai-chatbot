# Codex round 6 — session-window + load/scaling increment (GPT-5.6 Sol)

- Trigger: the owner asked how the system scales, how long a session lives
  before context issues, and for load evidence under concurrency. That
  question surfaced a REAL bug five prior review rounds missed: the client
  sent the entire transcript every turn while the server rejects >8000 total
  chars — normal sessions died mid-conversation around turn 10–12.
- Increment (specs in docs/specs/): client rolling window valid by
  construction + 50-exchange endurance tests through the real route (Opus
  builder), spend-guarded load harness + docs/SCALING.md with measured
  results (second Opus builder), measurements run by the orchestrator.
- Review verdict: FIX-THEN-ACCEPT (8 findings). Confirmation pass: 5 CLOSED,
  3 partial + 1 process defect — all then closed (below).

## Findings and final resolutions

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | HIGH | Prefix-truncating same-role merges could silently send the model an OLD question after a max-length retry — UI shows the new question, model answers the old one | Overflowing merges now keep the NEWEST content whole (retry semantics); single oversized messages still keep the head (answers front-load). Tests P2 (exact newest-kept) + P6 (RETRY-MARKER survives a 2000-char predecessor). Confirmed CLOSED |
| 2 | MED | "validateMessages(toPayloadMessages(anything)) never throws" overclaimed — empty/assistant-final inputs fail | Guarantee scoped everywhere (module comment, spec, tests) to the product's precondition: send() appends a non-empty user turn last; odd-length windows top out at promptWindowTurns−1. P1 rebuilt on a user-ending transcript and runs validateMessages |
| 3 | HIGH | Load tool could print PASS while the system was broken (net-fails/4xx/terminal-error events ignored by the verdict) — and the confirmation pass caught the FIX being incomplete: a `done` after an `error` overwrote the terminal state | Verdict fails on everything except 429; sticky `sawError` flag; a second terminal event is itself malformed; header + SCALING.md rule text aligned |
| 4 | HIGH | "localhost = zero spend" false — `next start` loads `.env.local`, so the documented command could fan real-model spend | Mock-marker preflight refuses fan-out against a keyed server (functionally proven both ways); `redirect: "error"`; quick-start command now explicitly keyless with the reason stated |
| 5 | MED | A stalled stream could hang the run indefinitely; reader leaks | 60s per-request AbortController (cleared in finally), body-null and read-failure classification, reader cancelled in finally. Confirmed CLOSED |
| 6 | MED | Cost/prompt numbers stale or underived | All numbers now derived and cross-checked against the final benchmark report's own per-scenario costs (prices reproduce to 6 decimals): ~$0.0024 measured avg (~2,100 turns/$5), ~$0.0066 Haiku / ~$0.0197 Sonnet bounded worst case, KB ~5.0K answer chars / 9.6KB JSON / ~1,550 measured input tokens. Confirmed CLOSED |
| 7 | MED | Interpretations exceeded evidence (single local process ≠ "conservative floor"; "effectively nothing" platform overhead; unproven 429 attribution; "local-dev only" limiter claim contradicting production reality) | Interpretation block restated with limits named; production's in-memory limiter degrade stated plainly with the Upstash step referenced; exact reproduction commands recorded. Confirmed CLOSED |
| 8 | MED | README/round-5-doc still carried the superseded "fails on substance" benchmark narrative | Both aligned to the final report: all three models pass substance in the final run; gpt-5-mini excluded by the 3s gate (5.3s; intermittent empty completions in earlier runs). Confirmed CLOSED |
| +1 | PROC | plan.md claimed the round-6 loop complete before this review artifact and the T-051 timeline entry existed; verification doc counts stale | This document, T-051, and refreshed counts land in the same commit as the claim — order restored |

## Measured results (full detail in docs/SCALING.md)

Local mock pipeline: 6,650 streamed requests across 25/50/100-concurrency
runs, zero errors, TTFB p95 ≤ 12ms; default-caps burst: limiter served
exactly its budget and 429'd the rest with zero 5xx; controlled live-prod
burst: 12 real-model turns at TTFB p50 1,218ms + 3 correct 429s. Session
endurance: 50 exchanges through the real route, every turn 200 + terminal
done, both normal and 1,500-char-message scenarios.
