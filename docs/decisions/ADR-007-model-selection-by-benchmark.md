# ADR-007: Model Selection by Scenario Benchmark

- Status: Accepted method; final model pending benchmark results
- Date: 2026-07-08

## Context

The take-home leaves model choice open and asks for the rationale in the review.
OpenRouter gives access to every candidate through one gateway, so the choice is
a measurable engineering decision rather than a preference.

## Decision

Run the scenario regression suite (six brief scenarios plus boundary prompts
from `data/curated/scenario-coverage.md`) against three candidates through the
same gateway and prompt:

1. **Claude Haiku-class** (cheap Anthropic, tool-capable) — expected winner on cost.
2. **One cheap non-Anthropic model** (GPT-5-mini or Gemini Flash class) — the
   control that shows the choice was compared, not assumed.
3. **Claude Sonnet-class** — quality baseline.

Recorded per candidate: factual correctness against the curated KB, correct tool
selection, boundary behavior (pricing, portal, security guarantees, injection),
median first-token and full-response latency, and token cost per turn.

**Selection rule: the least expensive model that passes every safety and
scenario check.** Exact OpenRouter model IDs are confirmed at wiring time
against the live catalog; results and the final pick are appended to this ADR.

## Alternatives considered

1. Pick Sonnet-class by reputation: saves an hour, weaker rationale, likely
   overpays per turn for a curated-KB support task.
2. Pick cheapest blindly: risks boundary-behavior failures discovered late.

## Consequences

- Roughly $0.30–0.50 of the metered budget spent on the benchmark.
- The model gateway must make swapping models a config change, which is good
  architecture regardless.

## Benchmark results (2026-07-09)

Run via `npm run benchmark` (scripts/benchmark.ts) through the production
gateway and prompt assembler: 8 scenario regression prompts + 2 injection
probes per model, automated boundary checks, live OpenRouter catalog pricing.
Full report with every response: `docs/benchmarks/2026-07-09-model-benchmark.md`.

| Model | Checks | Median first-token | Median total | Est. suite cost |
|---|---|---|---|---|
| `anthropic/claude-haiku-4.5` | 10/10 | 1,184 ms | 2,436 ms | $0.0205 |
| `openai/gpt-5-mini` | 10/10 | 5,699 ms | 6,550 ms | $0.0049 |
| `anthropic/claude-sonnet-4.5` | 10/10 | 1,357 ms | 3,431 ms | $0.0607 |

**Amendment to the selection rule, made after seeing these results and
documented as such:** every candidate passed correctness and boundary checks,
and the cost-only rule would have selected `gpt-5-mini`. But the results
exposed a criterion the original rule omitted — responsiveness. A median 5.7 s
of dead air before the first streamed token reads as a broken chat, and the
opt-in voice output (ADR-003) compounds it because speech waits for stream
completion. Selection criteria now: **cheapest model that passes every
scenario/boundary check AND has a median first-token latency ≤ 3 s.**

**Selected: `anthropic/claude-haiku-4.5`** (~$0.002 per turn; the metered $5
key buys roughly 2,400 turns). **Fallback (`OPENROUTER_FALLBACK_MODEL`):**
`anthropic/claude-sonnet-4.5`, the only other candidate passing all criteria —
an unbenchmarked model never answers (gateway fallback policy).
`openai/gpt-5-mini` remains the recorded cost floor if response latency ever
stops mattering (e.g. an async/email channel).
