# Codex round 5 — full-repo re-review + fix loop (GPT-5.6 Sol)

- Trigger: owner asked for a fresh rating after the round-3/4 fixes landed.
- Re-review verdict: **FIX-THEN-SHIP, 7.4/10** (up from round 3's 6.5) —
  previously closed findings explicitly confirmed non-reproducing. 8 new
  findings; all addressed the same night, then a confirmation pass
  (**7.7/10, FIX-THEN-ACCEPT**) verified 4 closed outright, flagged 4 as
  incomplete plus 3 new nits — every one of which was then closed (below).
  Full logs in session scratchpad (codex-round5-rereview.log,
  codex-round5-confirmation.log).

## Findings, fixes, and confirmation outcomes

| # | Sev | Finding | Resolution (post-confirmation state) |
|---|---|---|---|
| 1 | HIGH | Gateway treated EOF-before-`[DONE]` / bodyless 2xx as success — truncated output could earn cards, storage, and `done` (the round-4 EOF fix covered only the client) | Gateway throws `GatewayError` on both; regression tests for truncated stream and bodyless response. **Confirmed CLOSED** |
| 2 | HIGH | Benchmark scenario checks vacuous — a generic contact reply could score 10/10 and win selection | Spec'd `assertions.ts` (mustMatch published facts/refusals, mustNotMatch inventions, expectedCards running the real selector; 25 offline tests incl. the vacuous-reply fixture). Harness re-run live. Confirmation caught that the first rerun's regexes missed Unicode apostrophes (five of gpt-5-mini's seven failures were false negatives) → `normalizeForMatching()` added, unit-tested, harness re-run again for an honest report. Final truth: claude-haiku-4.5 10/10 (winner, unchanged); gpt-5-mini fails on substance (incl. two empty responses) AND the 3s latency gate; ADR-007 addendum states the corrected numbers |
| 3 | MED | `send()` double-fire race (state-based guard only) | Synchronous `inFlightRef` guard, cleared in finally. Mounted-component test deliberately skipped (no DOM test env; adding jsdom the day before submission judged riskier) — confirmation agreed: coverage limitation, not a defect. **Confirmed CLOSED** |
| 4 | MED | Delete route unbounded body + unlimited authenticated calls | `readJsonBounded` (4KB) + new `checkDeleteLimit` per-IP daily cap (generalized fail-closed daily limiter, `rl:del`, env-tunable, checked after token verification); route tests V6/V7 + real-implementation limiter tests (in-memory block/independence + Upstash prefix/fail-closed). Residual, named honestly: limiter durability in production still depends on Upstash provisioning — the standing user-gated submission-day item |
| 5 | MED | No provider timeout | `AbortSignal.timeout(45s)` composed with the client signal; timeout → typed `GatewayError`, client aborts preserved; tests. **Confirmed CLOSED** |
| 6 | MED | plan/README stale (12 entries, MemoryStore-in-prod, ADR range) | All corrected; confirmation caught two residuals — "all three passed" (now qualified with the substance-rerun outcome) and an over-broad "production does not degrade" (now names the rate-limiter exception explicitly) |
| 7 | MED | Escalation success copy promised a follow-up no pipeline delivers | Success copy, the KB self-description, AND (confirmation catch) the deterministic escalation card's offer copy in `select.ts` all now promise only that the request is saved, with the direct-contact route for urgency; README gains the staff-notification known-limitation |
| 8 | LOW | Timeline: broken table, stale header/pointer, personal path, project ref, recruiting detail | Table unified T-001…, header/pointer fixed, path→`~`, ref truncated, recruiting entry generalized; original preserved in session records. **Confirmed CLOSED** |

Confirmation-pass nits, all closed: verification-doc corrections (route-test
count 21, review filename now real, timeline pointer), and
`RATE_LIMIT_DELETES_PER_IP_PER_DAY` added to `.env.example` + README table.

## The honest benchmark story (worth telling in the interview)

Strengthening the assertions was itself reviewed, twice. Run 1 reported
gpt-5-mini at 3/10 — but the confirmation pass showed five of seven failures
were the checks' own fault (ASCII-apostrophe regexes rejecting correct
`can’t` refusals) → Unicode normalization. Run 2: gpt-5-mini 8/10 (two
genuinely empty completions — a reasoning model burning its whole 600-token
budget with no output) and sonnet 9/10 on a legitimate role-persistence
deflection the refusal regex didn't recognize → cluster broadened. Final
run: all three models 10/10 on substance; gpt-5-mini excluded by the 3s
latency gate (5.3s median); haiku wins at 977ms. The durable guarantee is in
the unit tests (a vague contact-only reply permanently fails three
scenarios), and the accepted ADR-007 selection reproduced under every
version of the checks. The correction trail is documented, not hidden —
grading text with regexes is exactly the kind of code that needs adversarial
review, and it got it.
