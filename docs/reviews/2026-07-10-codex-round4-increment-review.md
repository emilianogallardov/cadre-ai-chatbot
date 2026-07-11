# Codex round 4 — spec'd increment review (GPT-5.6 Sol)

- Scope: the two-spec hardening increment that un-deferred round-3 findings
  #11 and #12 — route-level tests for the three public routes
  (docs/specs/2026-07-10-route-level-tests.md) and the benchmark latency gate
  (docs/specs/2026-07-10-benchmark-latency-gate.md). Built by two parallel
  Opus subagents to pinned contracts; orchestrator re-verified before review.
- Reviewer: `gpt-5.6-sol`, read-only, xhigh; cross-checked every mock against
  the real module signatures and every spec case against its test.
- Round 1 verdict: FIX-THEN-ACCEPT (6 must-fix + 2 doc cleanups).
  Confirmation pass: all 8 CLOSED, one one-line comment-numbering regression
  found and fixed. Loop closed at ACCEPT-equivalent.

## Findings and resolutions

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | HIGH | C1/C5/C6 asserted membership, not sequence — C1 would pass reordered events; C5 would pass an error followed by more output | C1 asserts the complete typed sequence (both deltas verbatim, conversation at index 2, contiguous actions, done last, whole-array equality); C5 asserts exactly `["text","error"]`; C6 asserts text-first, no error, done-terminal |
| 2 | HIGH | V3 sent a syntactically invalid token, so HMAC verification was never reached — a route accepting forged signatures would still pass | V3 now mints a genuine token, flips one signature hex char (asserted different), and requires forged AND malformed tokens to return byte-identical status/body to malformed JSON (no oracle) |
| 3 | MED | C4's global branch would pass any 429 containing "daily capacity" | Asserts single event, `error`/`rate_limited`, `Retry-After: 100` |
| 4 | MED | Dynamic-import wrappers violated the spec's direct-import constraint | Static handler imports in all three suites (vitest hoists the mocks) |
| 5 | MED | Whole-module mocks hid export/signature drift | All seam mocks are typed `importOriginal` spreads overriding only the named function |
| 6 | MED | C7 ran the mock stream's real 15ms timers and set `VERCEL_ENV=""` instead of unsetting | Fake timers drained with `runAllTimersAsync` (restored in finally), env stubbed to undefined, text-event-first asserted |
| 7 | LOW | Three source comments contradicted implemented behavior (keyless-prod claim, escalation gate order, limiter description) | Rewritten to match the code |
| 8 | LOW | ADR-007 status line still said "final model pending results" | Now records the selected model + fallback under the amended rule |
| +1 | LOW | (Confirmation pass) my rewritten escalation comment numbered its list 1,2,4 | Renumbered |

## Outcome

- Route suites: 19 cases (C1–C7, V1–V5, E1–E7), each mapped 1:1 to a spec
  requirement, driven through real `NextRequest`s with real signed tokens
  (stubbed secret) and captured `after()` callbacks; zero network, zero spend.
- Benchmark: `selectModel` (pure, T1–T6) drives both report and console
  selection; a re-run now reproduces the accepted claude-haiku-4.5 pick.
  Reviewer confirmed the benchmark increment sound in round 1.
- Gate: 22 files, 230/230, lint, typecheck, production build.
- Runtime behavior unchanged (tests + comments + docs only) — no redeploy
  required; prod remains at the round-3 deploy.
