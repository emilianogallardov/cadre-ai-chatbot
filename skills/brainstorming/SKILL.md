---
name: brainstorming
description: Turn a rough idea into a validated design before writing code. Use for architectural or product decisions; skip it for mechanical, already-specified work.
---

# Brainstorming — design before code

## When to use
Before implementing anything with more than one reasonable approach: a new
feature, a schema, a boundary, a reversal of a prior decision. Skip it for
mechanical work where the design is already settled.

## The method
1. **Understand first.** Read the current state (files, ADRs, recent history)
   before proposing anything. One question at a time; prefer concrete choices
   over open-ended prompts.
2. **Explore alternatives.** Put 2–3 approaches on the table with trade-offs
   and a recommendation — never a single option presented as the only one.
3. **Validate incrementally.** Present the design in small sections and confirm
   each before moving on, so a wrong assumption is caught early and cheaply.
4. **Write it down, then build.** Capture the decision as an ADR or spec with
   the trigger that would reverse it. The record is the contract the code
   answers to.

## How it was used on this project
The decision to store conversations (ADR-008) reversed an earlier "no
persistent transcripts" cut (ADR-002). Rather than silently flip scope, the
reversal was designed in the open: the privacy obligations were made explicit
(notice at collection, honest private mode, delete control, enforced
retention) and written into the ADR *before* implementation, with the code
then held to that contract by tests. The answer-quality fixes
(`docs/specs/2026-07-11-answer-quality-voice-and-cta.md`) followed the same
path — decisions recorded, then measured.

## Anti-patterns (what not to do)
- **Don't present one option.** A single "here's the plan" skips the trade-off
  that reveals the better approach. Always bring alternatives.
- **Don't silently change scope.** If implementation and a prior decision
  disagree, resolve it in the doc first — never let the code quietly redefine
  what was agreed.
- **Don't over-scope (YAGNI).** Cut features the requirements don't need; every
  cut on this project is an ADR with a documented trigger to revisit, not a
  vague "maybe later."
- **Don't design in a vacuum.** Read the existing code and decisions first; a
  design that ignores what's there gets rejected on contact.
