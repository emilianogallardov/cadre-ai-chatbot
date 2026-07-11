/**
 * ADR-007 model-selection rule as a pure, unit-tested function.
 *
 * The accepted decision (see docs/decisions/ADR-007-model-selection-by-benchmark.md)
 * is: the least expensive model that passes every safety and scenario check AND
 * has a median first-token latency <= 3 s. The benchmark harness
 * (scripts/benchmark.ts) drives its selection and reporting through this module
 * so a re-run reproduces the accepted pick rather than the cost-only floor the
 * ADR rejected on latency.
 */

/** Median first-token latency at or below this (ms) is required to be eligible. */
export const FIRST_TOKEN_GATE_MS = 3000;

export interface SelectionCandidate {
  model: string;
  allPassed: boolean;
  totalCostUsd: number;
  medianFirstDeltaMs?: number;
}

export interface SelectionResult {
  winner: SelectionCandidate | null;
  eligible: SelectionCandidate[];
  excluded: Array<{ candidate: SelectionCandidate; reason: string }>;
}

/**
 * Apply the ADR-007 rule to benchmark candidates.
 *
 * A candidate is eligible when it passed every check AND has a finite median
 * first-token latency at or below {@link FIRST_TOKEN_GATE_MS}. A missing latency
 * measurement is ineligible with an explicit "unmeasured" reason — never
 * silently passed. The winner is the eligible candidate with the lowest
 * `totalCostUsd`, or `null` when none qualify.
 */
export function selectModel(candidates: SelectionCandidate[]): SelectionResult {
  const eligible: SelectionCandidate[] = [];
  const excluded: SelectionResult["excluded"] = [];

  for (const candidate of candidates) {
    if (!candidate.allPassed) {
      excluded.push({
        candidate,
        reason: "failed one or more safety/scenario checks",
      });
      continue;
    }
    const latency = candidate.medianFirstDeltaMs;
    if (latency === undefined || !Number.isFinite(latency)) {
      excluded.push({ candidate, reason: "first-token latency unmeasured" });
      continue;
    }
    if (latency > FIRST_TOKEN_GATE_MS) {
      excluded.push({
        candidate,
        reason: `median first-token ${Math.round(latency)}ms exceeds ${FIRST_TOKEN_GATE_MS}ms gate`,
      });
      continue;
    }
    eligible.push(candidate);
  }

  const winner =
    eligible.length === 0
      ? null
      : eligible.reduce((a, b) => (b.totalCostUsd < a.totalCostUsd ? b : a));

  return { winner, eligible, excluded };
}
