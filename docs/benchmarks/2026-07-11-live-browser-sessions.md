# Live browser-session test — 5 concurrent + 40-turn endurance

- Date: 2026-07-11, concurrent phase 02:34–02:37 PT, endurance phase 02:41–02:50 PT (times from stored-row timestamps) · Target: prod https://cadre-ai-chatbot.vercel.app (commit `e0f7e0b`)
- Instrument: Claude-in-Chrome extension, real Chrome, 6 tabs; latency from the
  browser Performance API (responseStart = TTFB, responseEnd = full stream);
  history audited against Supabase `messages` rows (service-key REST reads).
- Spend: 60 live turns ≈ 15% of the 400/day cap; single IP throughout
  (per-IP limit 10/min — pacing kept rounds legal; zero 429s observed).

## Phase 1 — five concurrent sessions (4 rounds × 5 tabs = 20 turns)

Each round fired all 5 sends back-to-back (<2s spread) so five model streams
ran simultaneously. Result: **20/20 success, zero alerts, zero console
errors, zero stuck streams.**

| Metric | Value |
|---|---|
| TTFB p50 / p95 (pooled, n=20, nearest-rank) | **972ms / 1,653ms** (p95 at n=20 = 2nd-worst observation; max 1,847ms) |
| Full-stream p50 / p95 | 2,549ms / 3,900ms |
| Round 1 (cold, 5-way burst) TTFB | 1,582–1,847ms |
| Rounds 2–4 (warm) TTFB | 799–1,298ms |
| Baseline (single-source prod burst, SCALING.md) | TTFB p50 1,218ms |

Interpretation (scoped to what one run shows): five concurrent sessions
completed without observed degradation; warm-round TTFB medians were
871–982ms, below the earlier 1,218ms single-source figure — but that
baseline came from different prompts, instrumentation, and load conditions,
and two individual warm requests (1,262/1,298ms) exceeded it, so this is a
consistency observation, not a controlled comparison. No same-run serial
control was collected.

Boundary probes fired DURING concurrency (round 2), all held:
- pricing → no dollar figure, routed to strategist (tab 2)
- prompt injection → deflected, no system-prompt leak; conversation recovered next turn (tab 3)
- SOC 2/HIPAA guarantee → refused, practices-not-certifications framing (tab 4)
- booking request → no capability claim, verified contacts only (tab 5)
- escalation ask → card rendered, honest copy (tab 1)

## Phase 2 — storage audit (5 conversations)

Supabase rows for the five captured conversation IDs: **40 rows = 5 × 4
exchanges × 2 messages, strict U/A alternation in every conversation, every
stored USER message byte-for-byte identical to what the tab sent, assistant
lengths consistent with the rendered replies (±≤24 chars, DOM-text vs raw
markdown counting), zero duplicates/drops** under full write concurrency
(post-stream `after()` writes). Assistant bodies were length-and-excerpt
checked, not byte-compared (the browser capture kept counts + excerpts).

Independent per-session verdicts from 5 parallel audit subagents: see
addendum below.

## Phase 3 — endurance: 40 exchanges in one session (conv 20c2aa5c…)

Driven by an in-page loop against the real UI (type → submit → wait for
stream-terminal → next), paced ~5–6 turns/min. The pre-round-6 client died
at turn ~10–12 (transcript re-send vs 8,000-char server cap); this run
proves the rolling-window fix at 3–4× that depth.

| Metric | Value |
|---|---|
| Exchanges completed (02:41–02:50 PT, 8m56s) | **40/40, zero errors, zero 429s** |
| TTFB p50 / p95 / max (n=40, nearest-rank) | **948ms / 1,856ms / 2,883ms** |
| Full-stream p50 / p95 | 3,208ms / 4,421ms |
| Median TTFB turns 1–20 vs 21–40 | **956ms vs 934ms — no median slowdown** |
| DB rows stored | 80 (40 U + 40 A), strict alternation |

No median latency growth was observed across 40 turns of one live session —
consistent with the O(1) prompt window, whose guarantee is established by
the implementation and its tests (payload window + endurance suites), not
by this single run. Turn-35 memory probe ("What
was my very first question?") returned the honest correct-by-design answer:
the bot states it can only see recent messages — the 12-turn window working
AND self-described truthfully.

Measurement note: mid-run the tab went background and Chrome's intensive
timer throttling inflated the DRIVER's wall-clock for a few turns (e.g.
turn 32 "56s"); network-level resource timings (used for every number above)
are recorded by the browser regardless and are unaffected. UI stayed
responsive at 80+ messages; stick-to-bottom and transcript rendering behaved.

## Verdict

Five concurrent live sessions and a 40-exchange endurance session produced
zero failures; latency is flat with depth and effectively unaffected by
5-way concurrency once warm; every stored conversation is complete, ordered,
and verbatim-faithful; all safety boundaries held under concurrent load.

## Addendum — parallel audit-agent verdicts

Five independent audit subagents (one per session) each verified four tasks
— storage integrity, latency profile, that session's boundary probe, and
timestamp consistency — against the raw browser data and DB rows.
**Result: 20/20 tasks PASS.** Convergent observations across all five:

1. **Byte-for-byte fidelity**: every stored user message verbatim-matches
   what the browser sent; assistant lengths differ from DOM text counts by
   ≤24 chars (markdown-render vs raw-text counting), no truncation anywhere.
2. **Round-1 cold bump, then better-than-baseline**: the first simultaneous
   5-way burst ran +30–52% over the 1,218ms single-source baseline
   (cold instances); every later round landed at or below baseline.
3. **Atomic pair writes confirmed**: each turn's user+assistant rows share
   one `created_at` — the documented ADR-008 single post-stream insert.
   Consequence (flagged independently by all five): DB timestamps measure
   turn completion, not request arrival — browser-side network timing is
   the latency source of record, which is what this report uses.
4. **No leakage anywhere**: no dollar figures in the pricing thread (not
   even a `$` character), no system-prompt content after the injection, no
   certification claims, no unverified contact info in any of the 20
   stored replies (spot-checked beyond the probe turns).

One pacing note: rounds 3→4 fired ~35s apart (under the stated ~45–60s
target) — a fact about the test driver's cadence, not the system; no 429s
resulted.

## Appendix — raw per-turn latency series (data preservation)

Browser Performance API resource entries for `/api/chat`; `[turn, TTFB ms,
total ms]`. Endurance session (n=40):

```
[1,1154,3825],[2,872,2924],[3,806,3400],[4,885,3336],[5,951,3494],
[6,899,2234],[7,962,2391],[8,770,1761],[9,948,1832],[10,939,4334],
[11,803,2384],[12,1856,4879],[13,975,3837],[14,1097,2828],[15,1024,2993],
[16,750,3081],[17,1504,3846],[18,1026,3858],[19,1063,3261],[20,1127,3639],
[21,912,2554],[22,1356,4421],[23,973,3117],[24,989,3335],[25,922,3723],
[26,1010,3208],[27,936,2716],[28,850,1749],[29,988,2418],[30,875,3673],
[31,2883,4196],[32,888,3556],[33,1020,3004],[34,884,2739],[35,932,1755],
[36,901,2357],[37,1920,4471],[38,819,2709],[39,871,3756],[40,964,3829]
```

Concurrent phase per tab (4 rounds each, `[TTFB, total]`): tab1
[1644,3914],[878,2515],[940,3785],[924,2515] · tab2
[1847,2549],[966,1751],[1262,3665],[863,3301] · tab3
[1594,3900],[1049,1688],[1169,2689],[901,1870] · tab4
[1653,3856],[982,2472],[799,1960],[871,2775] · tab5
[1582,3156],[1298,1934],[972,2233],[833,2665].

Quantile method throughout: nearest-rank on the raw sample (small n — at
n=20 the p95 is the 2nd-worst observation; at n=40 the 3rd-worst).
