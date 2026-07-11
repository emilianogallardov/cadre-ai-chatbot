import { describe, expect, it } from "vitest";

import {
  FIRST_TOKEN_GATE_MS,
  selectModel,
  type SelectionCandidate,
} from "../selection";

describe("selectModel (ADR-007 latency gate)", () => {
  it("T1 excludes the cheapest fully-passing model that fails the gate and picks the costlier passing model within it", () => {
    // The exact ADR-007 history: gpt-5-mini is cheapest but 5.7 s median, so
    // claude-haiku-4.5 wins on the combined cost + latency rule.
    const candidates: SelectionCandidate[] = [
      {
        model: "openai/gpt-5-mini",
        allPassed: true,
        totalCostUsd: 0.0049,
        medianFirstDeltaMs: 5699,
      },
      {
        model: "anthropic/claude-haiku-4.5",
        allPassed: true,
        totalCostUsd: 0.0205,
        medianFirstDeltaMs: 1184,
      },
      {
        model: "anthropic/claude-sonnet-4.5",
        allPassed: true,
        totalCostUsd: 0.0607,
        medianFirstDeltaMs: 1357,
      },
    ];

    const result = selectModel(candidates);

    expect(result.winner?.model).toBe("anthropic/claude-haiku-4.5");
    expect(result.eligible.map((c) => c.model)).toEqual([
      "anthropic/claude-haiku-4.5",
      "anthropic/claude-sonnet-4.5",
    ]);
    expect(result.excluded).toEqual([
      {
        candidate: candidates[0],
        reason: "median first-token 5699ms exceeds 3000ms gate",
      },
    ]);
  });

  it("T2 treats a missing median first-token latency as ineligible with the unmeasured reason", () => {
    const candidate: SelectionCandidate = {
      model: "anthropic/claude-haiku-4.5",
      allPassed: true,
      totalCostUsd: 0.0205,
    };

    const result = selectModel([candidate]);

    expect(result.winner).toBeNull();
    expect(result.eligible).toEqual([]);
    expect(result.excluded).toEqual([
      { candidate, reason: "first-token latency unmeasured" },
    ]);
  });

  it("T3 excludes a model with allPassed=false regardless of latency or cost", () => {
    const candidate: SelectionCandidate = {
      model: "cheap/fast-but-unsafe",
      allPassed: false,
      totalCostUsd: 0.0001,
      medianFirstDeltaMs: 100,
    };

    const result = selectModel([candidate]);

    expect(result.winner).toBeNull();
    expect(result.eligible).toEqual([]);
    expect(result.excluded).toEqual([
      { candidate, reason: "failed one or more safety/scenario checks" },
    ]);
  });

  it("T4 returns winner=null and lists every candidate in excluded when none are eligible", () => {
    const candidates: SelectionCandidate[] = [
      {
        model: "slow/passing",
        allPassed: true,
        totalCostUsd: 0.001,
        medianFirstDeltaMs: 4000,
      },
      {
        model: "failing/model",
        allPassed: false,
        totalCostUsd: 0.002,
        medianFirstDeltaMs: 500,
      },
      { model: "unmeasured/model", allPassed: true, totalCostUsd: 0.003 },
    ];

    const result = selectModel(candidates);

    expect(result.winner).toBeNull();
    expect(result.eligible).toEqual([]);
    expect(result.excluded.map((e) => e.candidate.model)).toEqual([
      "slow/passing",
      "failing/model",
      "unmeasured/model",
    ]);
    expect(result.excluded.map((e) => e.reason)).toEqual([
      "median first-token 4000ms exceeds 3000ms gate",
      "failed one or more safety/scenario checks",
      "first-token latency unmeasured",
    ]);
  });

  it("T5 picks the strictly lowest-cost model among several eligible candidates", () => {
    const candidates: SelectionCandidate[] = [
      {
        model: "mid/cost",
        allPassed: true,
        totalCostUsd: 0.02,
        medianFirstDeltaMs: 1000,
      },
      {
        model: "low/cost",
        allPassed: true,
        totalCostUsd: 0.01,
        medianFirstDeltaMs: 2000,
      },
      {
        model: "high/cost",
        allPassed: true,
        totalCostUsd: 0.03,
        medianFirstDeltaMs: 500,
      },
    ];

    const result = selectModel(candidates);

    expect(result.winner?.model).toBe("low/cost");
    expect(result.eligible).toHaveLength(3);
    expect(result.excluded).toEqual([]);
  });

  it("T6 treats exactly 3000ms as eligible and 3001ms as excluded", () => {
    const atGate: SelectionCandidate = {
      model: "at/gate",
      allPassed: true,
      totalCostUsd: 0.05,
      medianFirstDeltaMs: FIRST_TOKEN_GATE_MS,
    };
    const overGate: SelectionCandidate = {
      model: "over/gate",
      allPassed: true,
      totalCostUsd: 0.01,
      medianFirstDeltaMs: FIRST_TOKEN_GATE_MS + 1,
    };

    const result = selectModel([atGate, overGate]);

    expect(result.winner?.model).toBe("at/gate");
    expect(result.eligible).toEqual([atGate]);
    expect(result.excluded).toEqual([
      {
        candidate: overGate,
        reason: "median first-token 3001ms exceeds 3000ms gate",
      },
    ]);
  });
});
