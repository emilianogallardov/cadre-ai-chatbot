# Codex round 10 — live-test evidence + answer-quality review (GPT-5.6 Sol)

- Trigger: owner asked for a review of the T-056 increment AND a qualitative
  look at the stored chats: "are we really answering correctly — not just
  technically, but in a way that is useful and that will build trust?"
- Inputs: the T-056 docs (report, SCALING.md rows, timeline entry) plus all
  120 stored messages from the six live prod conversations, checked against
  the curated KB.
- Verdict: **FIX-THEN-ACCEPT — no HIGHs, 7 MED + 2 LOW.** Part A: the
  documentation overstated what one uncontrolled run proves. Part B: answers
  are "generally safe and useful"; the two real defects are CTA boilerplate
  and one class of confident invention.

## Part A — evidence findings (docs corrected in place; data preserved)

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | MED | "Concurrency costs nothing measurable" exceeded the experiment: no same-run serial control; the 1,218ms baseline came from different prompts/instrumentation/load; two warm requests exceeded it | Reworded to scope: completed without observed degradation; warm-round medians 871–982ms; explicitly "a consistency observation, not a controlled comparison" |
| 2 | MED | "Flat with depth / O(1) proven live" from two medians of one run is not statistically established | Reworded: "no median slowdown observed… consistent with the O(1) window, whose guarantee is established by the implementation and its tests, not by this single run" |
| 3 | MED | The endurance per-turn latency series existed only in session context — the claimed numbers could not be independently recomputed | Full 40-turn series + concurrent per-tab series appended to the report as a raw-data appendix; also preserved as live-audit-latency-series.json in session records |
| 4 | MED | "Byte-for-byte" audited overreach: only USER messages were byte-compared; assistant bodies were length/excerpt-checked. "Atomicity confirmed" overstated what matching timestamps show | Reworded precisely in both the report and SCALING.md |
| 5 | MED | Chronology impossible as written: docs said ~02:50–03:20/03:45 PT but the commit is 02:57 and the DB rows place the runs at 02:34–02:50 | Times corrected from stored-row timestamps (concurrent 02:34–02:37, endurance 02:41–02:50, 8m56s; SCALING row ~11min → ~9min). The DATA was consistent; the labels were sloppy |
| 6 | LOW | Percentiles at n=20/40 unlabeled (p95 = 2nd/3rd-worst observation) | "Nearest-rank sample quantiles" stated with n and max |

## Part B — answer-quality findings

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 7 | MED | Confident invention by synthesis: the bot told a logistics prospect Cadre does "route optimization" to "reduce costs" — the KB lists logistics as an industry and field-scheduling/supplier-confirmation as SEPARATE examples, never connecting them; elsewhere "proposal turnaround"/"scheduling efficiency" presented as published metrics | Synthesis-grounding rule added to the system prompt (entries may not be combined into new Cadre claims; industry-specific applications framed as possibilities "even when asked for a short answer — brevity is not a license to state possibilities as facts"); pinned by prompt tests + a live probe in scripts/quality-metrics.ts that must pass in EVERY enforcement run. Verified: probe passed both final runs with the correct framing |
| 8 | MED | Contact boilerplate degrades the conversation: verified contacts in 49/60 replies (32/40 endurance); "feels like lead capture rather than expert help" | Root cause was the prompt's UNCONDITIONAL "offer the verified contact route"; replaced with (asks-or-can't-answer) AND not-already-visible. Measured: contact rate 75%→42%, grounded-turn violations 5/12→1/24, consecutive repeats 6/run→1/run |
| 9 | LOW | "One more detail" turns recite prior content + CTA; partly a test artifact (topic outside the 12-turn window; vague prompts) | Formula-breaker rules (conditional closing question, varied openings) + the CTA cooldown; the honest turn-35 memory reply was noted CORRECT by the reviewer |

## What held up well (reviewer-confirmed)

Pricing/booking/compliance/provider/scoring/team/timeline unknowns all
handled honestly with no invented hard facts; injection refusal clean with
normal recovery; core answers substantive rather than deflective; context
used where available; storage evidence genuinely supports the row-level
claims; pronoun drift rated "polish-level" (fixed anyway this round with the
voice pin — owner decision: "I" + Cadre in third person).

## Closure evidence

Spec docs/specs/2026-07-11-answer-quality-voice-and-cta.md (owner decisions
recorded); baseline vs after quality-metrics artifacts in docs/benchmarks/
(baseline: 9/12 contact, 5 grounded violations, 6 consecutive pairs, voice
violations, synthesis overreach reproduced → after, aggregate of 2×12 turns:
10/24 contact, 1 grounded violation, 2 pairs, 0 voice, 0 synthesis
failures); the enforcement gate caught the first cooldown wording being
logically disjunctive (legitimate routing turns restated contacts) — fixed
to (a-or-b)-AND-not-visible; `npm run verify` 26 files / 292 tests green
(5 new prompt-pin tests); post-fix benchmark regression rerun; log
codex-round10-quality.log (session records).
