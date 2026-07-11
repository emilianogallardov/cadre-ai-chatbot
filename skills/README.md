# Skills — the methods that built this repo

This project was AI-orchestrated on purpose. Rather than one-shot the code, it
was driven through a small set of repeatable **skills** (methods) that
prioritize verification over speed. This folder documents the ones that
actually shaped this codebase, so the workflow is auditable — not just the
result.

Each skill is a self-contained method with a **when-to-use**, the **steps**,
**how it was used on this project** (with links to real evidence in the repo),
and an **anti-patterns** section — the mistakes the method exists to prevent,
several of which this project hit and recovered from in the open.

| Skill | What it does | Evidence in this repo |
|---|---|---|
| [codex-review](codex-review/SKILL.md) | Adversarial external review loop (a second model tries to break each increment) | `docs/reviews/` — 11 rounds, one record each |
| [systematic-debugging](systematic-debugging/SKILL.md) | Four-phase root-cause method: understand before fixing | `docs/reviews/2026-07-11-codex-round10…`, escalation fix (T-070) |
| [brainstorming](brainstorming/SKILL.md) | Refine a rough idea into a design before writing code | `docs/decisions/ADR-008…`, `docs/specs/2026-07-11-answer-quality…` |
| [adversarial-verification](adversarial-verification/SKILL.md) | Don't trust a claim until an independent pass tries to refute it | `docs/benchmarks/`, blind-agent audits (T-060, T-062) |

The full, append-only record of how these were applied — including the honest
corrections — lives in [`../ACTIVITY-TIMELINE.md`](../ACTIVITY-TIMELINE.md) and
[`../docs/ai-workflow-log.md`](../docs/ai-workflow-log.md).

> These are cleaned, project-specific write-ups of the methods used here. They
> are intentionally tool-agnostic: the value is the discipline, not any
> particular CLI.
