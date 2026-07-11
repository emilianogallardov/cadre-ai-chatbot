# Spec: encode the ADR-007 latency gate in the benchmark harness

- Origin: Codex round-3 finding #11. ADR-007's accepted rule is "the least
  expensive model that passes every safety and scenario check AND has a
  median first-token latency ≤ 3 s", but `scripts/benchmark.ts` still selects
  the cheapest `allPassed` model — re-running it would recommend a model the
  ADR rejected on latency.
- Goal: the executable harness agrees with the accepted decision, and the
  selection rule is a pure, unit-tested function.

## Design

1. New pure module `src/lib/benchmark/selection.ts` (placed under `src/` so
   the existing vitest include pattern covers its tests):

   ```ts
   export interface SelectionCandidate {
     model: string;
     allPassed: boolean;
     totalCostUsd: number;
     medianFirstDeltaMs?: number;
   }
   export const FIRST_TOKEN_GATE_MS = 3000;
   export interface SelectionResult {
     winner: SelectionCandidate | null;
     eligible: SelectionCandidate[];
     excluded: Array<{ candidate: SelectionCandidate; reason: string }>;
   }
   export function selectModel(candidates: SelectionCandidate[]): SelectionResult;
   ```

   Eligibility: `allPassed === true` AND `medianFirstDeltaMs` is a finite
   number AND `medianFirstDeltaMs <= FIRST_TOKEN_GATE_MS`. A missing latency
   measurement is INELIGIBLE (reason says unmeasured), never silently passed.
   Winner: lowest `totalCostUsd` among eligible; `null` when none. Excluded
   entries carry human-readable reasons ("failed N checks", "median
   first-token 5700ms exceeds 3000ms gate", "first-token latency unmeasured").

2. `scripts/benchmark.ts` uses `selectModel` in BOTH places that currently
   filter `allPassed` and reduce by cost (the Markdown report ~line 444 and
   the console selection ~line 544). The report's "Selection rule" text
   states the full ADR-007 rule including the gate, and lists excluded models
   with their reasons. `ModelSummary` already carries every needed field —
   pass summaries straight in (structural typing; do not change
   `ModelSummary`).

3. One dated addendum line in ADR-007 under its existing amendment/results
   section: the harness now encodes the latency gate (this spec's date), so
   re-running it reproduces the accepted selection.

## Tests (`src/lib/benchmark/__tests__/selection.test.ts`)

- T1 cheapest fully-passing model FAILING the gate is excluded; a costlier
  passing model within the gate wins (this is the exact ADR-007 history:
  gpt-5-mini cheapest but 5.7s median → claude-haiku-4.5 wins).
- T2 missing `medianFirstDeltaMs` → ineligible with the unmeasured reason.
- T3 `allPassed: false` → ineligible regardless of latency/cost.
- T4 no eligible models → `winner: null`, all in `excluded` with reasons.
- T5 tie-free ordering: among several eligible, strictly lowest cost wins.
- T6 boundary: exactly 3000ms is eligible; 3001ms is not.

## Hard constraints

- Do not change benchmark measurement, pricing, or pass/fail logic — only
  selection/reporting.
- Do not run the benchmark (it spends the metered key). `npx tsc --noEmit`
  plus the unit tests prove the change.

## Acceptance

- `npm run verify` green including the new tests.
- `grep -n selectModel scripts/benchmark.ts` shows both call sites.
- Handoff reports: diff summary, test names/results, ADR-007 addendum text.
