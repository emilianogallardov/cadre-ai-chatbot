# ADR-004: Structured Tools for Actions and Side Effects

- Status: Accepted
- Date: 2026-07-08

## Context

The agent must answer questions, direct users to Cadre resources, and handle
unknown questions. Natural-language instructions alone are not a reliable
boundary for actions such as storing an escalation.

## Decision

Represent meaningful actions as a small allowlist of typed tools. Execute tools
server-side after schema and policy validation. Keep informational actions
deterministic where possible.

Initial action set:

- `show_strategy_contact`
- `show_maturity_index_path`
- `show_portal_help`
- `create_escalation`

## Alternatives considered

1. Prompt-only prose: fastest, but actions are hard to test and easy to fake.
2. Many specialized agents: unnecessary coordination for four outcomes.
3. One support model with a few structured tools: testable and explainable.

## Consequences

- Tool schemas become part of the test surface
- The model cannot directly access databases or arbitrary URLs
- Calendar booking and portal login stay unavailable until verified integrations
  exist

## Revisit when

Cadre provides real CRM, scheduling, portal, or ticketing integrations.
