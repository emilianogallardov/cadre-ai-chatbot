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

## Benchmark results

Pending — appended after Phase 2 wiring.
