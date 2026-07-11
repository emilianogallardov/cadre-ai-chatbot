# Spec: answer-quality pass — voice pin, CTA cooldown, formula breakers

- Trigger: the live browser test (T-056) stored 120 real prod messages; a
  qualitative audit of them (owner-directed: "are we answering in a way that
  is useful and builds trust?") found the replies factually clean but
  formulaic. Root causes located in `src/lib/prompt/assemble.ts`, not in the
  model: no voice rule, an UNCONDITIONAL "offer the verified contact route"
  instruction, and a stale style rule the model has learned to ignore.
- Owner decisions (2026-07-11): voice = first-person-singular assistant +
  third-person company ("I" / "Cadre publishes…"); scope = prompt fixes +
  full test battery, no KB gap-fill this round.

## Findings being fixed

| # | Finding | Evidence |
|---|---|---|
| 1 | Persona drift: S1 speaks as "we work with construction companies", S3–S6 speak of Cadre in third person; endurance session drifts within itself | live-chat-transcripts.md (session records) |
| 2 | CTA treadmill: identical contact triple ends 38 of 40 endurance turns — instructed by "say so briefly and offer the verified contact route" firing on every not-in-KB turn | assemble.ts:39-41; transcripts |
| 3 | Formula fatigue: closing question on ~100% of replies; "I don't have X… What I do know is…" scaffold recited on consecutive turns | transcripts (endurance turns 14-19, 23, 27-29, 31, 34, 36, 38-39) |
| 4 | Stale style rule: prompt forbids markdown ("No markdown headers… few sentences") while the UI renders markdown and every live reply uses bold structure — an instruction the model demonstrably ignores undermines the style section's authority | assemble.ts:52-54 vs any live reply |
| 5 | (Codex round 10 #7, MED) Synthesis overreach: the bot combines separate KB facts into unauthorized claims — told a logistics prospect Cadre does "route optimization" to "reduce costs" (KB lists logistics as an industry and field-scheduling/supplier-confirmation as separate examples; never connects them, never says route optimization); separately presented "proposal turnaround" and "scheduling efficiency" as published metrics | S3 turn 4, S6 turn 15; docs/reviews round-10 record |

## Changes (all in `buildSystem()` — prompt text only, no route/gateway code)

1. **Voice rule**: "Speak as yourself in the first person ('I'). Refer to
   Cadre in the third person ('Cadre publishes…', 'their team'). Never say
   'we'/'our' meaning Cadre — you are Cadre's assistant, not the company."
2. **Contact cooldown**: replace the unconditional instruction with: state
   full contact details ONLY when (a) the user asks how to reach someone or
   what the next step is, (b) you cannot answer the question at all, or
   (c) the details do not already appear in the visible conversation. When
   they were recently given, refer back lightly or omit. (The model sees the
   12-turn window, so "already visible" is checkable by the model.)
3. **Formula breakers**: end with a follow-up question only when it
   genuinely narrows what the user needs — not on every reply; vary sentence
   openings instead of repeating the same scaffold on consecutive replies.
4. **Style reconciliation**: allow light markdown (bold, short lists — no
   headers or tables), keep answers compact; drop the ignored rule.
5. **Synthesis-grounding rule** (Codex round 10 #7): do not combine separate
   knowledge entries into new claims about what Cadre has done or achieved;
   published examples may only be attributed to the context the entry gives
   them; anything beyond the entries must be framed as a possibility to
   explore ("a strategist could look at…"), never as a Cadre example,
   capability, or outcome.
6. **Unchanged and re-verified**: grounding rule, prohibitions, verified
   contacts as the ONLY statable contact details, policy lines.

## Tests

### Deterministic (in the gate)
- `src/lib/prompt/__tests__/assemble.test.ts` additions: the assembled
  system contains the voice rule and cooldown conditions; it does NOT
  contain the old unconditional "and offer the verified contact route"
  string; verified contacts still present exactly once.

### Measured (live, explicit spend, NOT in the gate)
- New `scripts/quality-metrics.ts` (pattern-match `scripts/benchmark.ts`:
  explicit invocation, requires OPENROUTER_API_KEY, prints spend, never runs
  in `npm run verify`). Drives ONE scripted 12-turn conversation through the
  production model config and computes:
  1. contact-detail occurrences (regex on phone/email/contact URL) — target
     ≤3/12 and never consecutive-unasked (script marks which turns ASK for
     contact; those don't count against),
  2. closing-question rate — target <60%,
  3. voice violations — `\bwe\b|\bour\b|\bus\b` used as company voice
     (allowlist "let us know"-style idioms if hit) — target 0,
  4. scaffold repetition — max pairwise trigram-overlap between consecutive
     replies — report + compare, no hard target (informative),
  5. substance guard — replies non-empty, ≥200 chars median (no
     terse-refusal regression),
  6. synthesis probe — the exact S3-turn-4 prompt ("Summarize what Cadre
     could do for a logistics company in two sentences."); reply must not
     assert unpublished capabilities as fact (assertive framings like
     "Cadre helps logistics companies [with X] to reduce costs"); possibility
     framing ("could explore", "might", "a strategist would look at") passes.
- Baseline (measured from the T-056 live transcripts by Codex round 10):
  contact details in 49/60 replies (32/40 endurance), closing question in
  36/40 endurance replies, two synthesis-overreach replies. These are the
  numbers to beat.
- Protocol: run BEFORE the prompt edit (baseline commit) and AFTER; both
  reports saved to docs/benchmarks/ with the comparison table. Every metric
  must improve or hold; substance must hold.
- Benchmark regression: `scripts/benchmark.ts` rerun after the edit — all
  models' substance checks stay at final-report levels; REFUSAL clusters
  still match (prompt changes must not soften boundary behavior).
- Live boundary re-fire (browser or curl): pricing, injection, SOC 2,
  booking, escalation — same refusal semantics, contacts only from the
  verified list.

## Hard constraints

- Files: `src/lib/prompt/assemble.ts`, its test file, `scripts/quality-metrics.ts`
  (new), docs/benchmarks report. Nothing else.
- `npm run verify` stays green and stays spend-free.
- No change to knowledge-base.json, routes, gateway, or UI this round.
- Codex round-10 Part B findings (in flight at spec time) get adjudicated
  into this spec before the prompt edit lands; the review record notes any
  additions.
