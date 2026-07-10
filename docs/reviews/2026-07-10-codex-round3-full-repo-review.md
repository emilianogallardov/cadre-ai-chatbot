# Codex round 3 — full-repo pre-submission review (GPT-5.6 Sol)

- Reviewer: OpenAI Codex CLI, `gpt-5.6-sol` (GA 2026-07-09), read-only
  sandbox, xhigh reasoning; ~50 commands, 253k tokens; ran its own
  history-aware Gitleaks scan of all 49 commits (clean).
- Scope: entire repository with fresh eyes — code, docs, tests, secrets,
  hard-deliverable requirements. Prior rounds (design + implementation of
  ADR-008) were explicitly out of re-litigation scope.
- Reviewer verdict: FIX-THEN-SHIP, 6.5/10. Every claim was independently
  re-verified against the code before adjudication; two of its assertions
  relied on environment artifacts of its sandbox (stale `.next` typecheck
  noise, no network) and were discounted as such.

## Adjudication

| # | Sev | Finding | Verdict | Resolution |
|---|---|---|---|---|
| 1 | HIGH | Upstash unprovisioned → "global" daily cap is per-instance memory | ACCEPTED (known, documented degrade) | Elevated from optional to strongly recommended on the submission-day list; fail-closed-on-missing-env rejected (would break local dev; the documented degrade + provider credit backstop is the honest design) |
| 2 | MED | $-ceiling math ignores the Sonnet fallback worst case | ACCEPTED as doc fix | ADR-006 now states the true worst case (~$5–6/day with the fallback taking every request) and names the key's prepaid credit limit as the hard backstop |
| 3 | HIGH | SSE parser swallows OpenRouter mid-stream `error` payloads; truncated output looks successful, gets cards + storage | CONFIRMED — genuinely missed by both prior rounds | `parseSseLine` now throws `GatewayError` on top-level `error` or `finish_reason:"error"`; route's existing catch path emits the typed client error and skips cards/storage/done. 5 regression tests (error before output, error after partial output, normal finish reasons unaffected) |
| 4 | HIGH | Personal OpenRouter key still in prod | ALREADY TRACKED | User-gated submission-day swap + rotation (unchanged) |
| 5 | HIGH | Three planning docs still describe session-only transcripts / pending components | CONFIRMED (rubric audit checked only CLAUDE.md/plan.md/ADRs) | Historical-artifact banners added to data-and-storage.md, component-checklist.md, and the design doc, each pointing at ADR-008/plan.md |
| 6 | MED | Client discards typed StreamError messages; "still in the box" copy false; EOF-without-done treated as success | CONFIRMED | Server's user-safe message now shown verbatim; failed sends restore the text into the composer (making the copy true — refined by the UI session into a render-time state adjustment); missing terminal `done` (without abort) now errors |
| 7 | MED | Unrestricted ReactMarkdown anchors = prompt-injected phishing surface | CONFIRMED | `verifiedLinks.ts` whitelist (cadreai.com origins, verified mailto/tel, same-app paths) + custom `a` renderer; unverified hrefs render as plain text; unit tests incl. `javascript:`, lookalike hosts, protocol-relative URLs |
| 8 | MED | Body parsing trusts Content-Length / parses unbounded before limiting | CONFIRMED (impact bounded by platform caps) | Shared `readJsonBounded()` enforces byte caps on the actual stream (cancels past cap, 413); both mutating JSON routes use it; header trust removed |
| 9 | MED | Missing prod credentials silently degrade to mock chat / fake `local-*` lead IDs | CONFIRMED as prod footgun | In `VERCEL_ENV=production`: keyless chat now returns a typed 503 with verified contacts; unconfigured escalation store fails into the existing direct-contact fallback. Dev/preview keep the mock |
| 10 | MED | Benchmark assertions shallow for some scenarios | DEFERRED | ADR-007 documents the method honestly; harness already served its decision. Re-running it is not on any path to submission. Named here rather than hidden |
| 11 | MED | Benchmark selection ignores the post-hoc latency gate | DEFERRED | The gate is documented in ADR-007 as added openly after results; encoding it into a script that will not run again buys nothing before Saturday |
| 12 | MED | No route-level/component tests in the verify gate | DEFERRED (documented degrade) | Accepted in the requirements-verification doc: scenario coverage via benchmark harness through production code paths + live prod regression. Round 3 added 13 unit tests at the exact seams it flagged |
| 13 | LOW | Delete button not disabled during later streams (handler no-ops silently) | CONFIRMED (prior fix was handler-only) | `disabled={deleting || streaming}` + title explains why |
| 14 | LOW | ADR index missing ADR-008/model result; README says 12 KB entries (real: 14); migrations description stale | CONFIRMED | All refreshed |

## Outcome

- Fixed this round: #2, #3, #5, #6, #7, #8, #9, #13, #14 (9 of 14).
- Already tracked user-gated: #1 (Upstash — now strongly recommended), #4
  (key swap + rotation).
- Deferred with documented reasoning: #10, #11, #12 (benchmark/test rigor —
  no submission-path value, named in the verification doc).
- Gate after fixes: `npm run verify` green — 18 files, 205/205, lint,
  typecheck, production build.
