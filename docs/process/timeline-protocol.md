# Timeline Logging Protocol

## Purpose

Maintain an honest, append-only narrative of how the take-home was planned,
built, corrected, deployed, and submitted. The timeline is both continuity for
future agents and evidence for the Claude Code workflow portion of the review.

The canonical log is `ACTIVITY-TIMELINE.md`.

## Ownership

The primary agent owns timeline edits. Subagents must not edit the timeline
concurrently because parallel appends can overwrite or reorder entries.

Every subagent response should include a short handoff:

```text
Timeline handoff
- Action:
- Outcome:
- Evidence:
- Status: complete | partial | failed | reverted | blocked
```

The primary agent verifies the evidence and appends the canonical entry.

## Required logging moments

Append a timeline entry:

1. At the start of a new work phase or material task
2. After a decision that changes scope, architecture, data, or schedule
3. After creating or materially changing a user-facing artifact
4. After a test, deployment, or verification gate
5. After an error, failed approach, rollback, or blocker
6. After a subagent handoff is accepted, modified, or rejected
7. After a commit, push, preview deployment, production deployment, or submission
8. Before the primary agent reports a material task complete

Routine read-only inspection commands may be grouped into one entry when they
support the same action. Do not bury meaningful failures inside a generic
“worked on project” entry.

## Entry requirements

Each entry must contain:

- Sequential ID
- Local date/time, or “time not captured”
- Actor/tool
- Concrete action
- Rationale or outcome
- Verifiable evidence and status

Use exact timestamps only when they are available from the terminal, tool
output, commit, deployment, or message. Approximate or unknown times must be
labeled honestly.

## Append-only rules

- Never delete a failure or rewrite an earlier decision to look prescient.
- Correct an inaccurate entry with a new correction entry.
- If work is reverted, preserve both the original and revert entries.
- Never include secret values, private tokens, raw PII, or hidden reasoning.
- Link to artifacts and commits; do not paste large logs.
- Distinguish “planned,” “implemented,” “tested,” “deployed,” and “verified.”

## Start-of-session procedure

1. Read the latest timeline entry.
2. Read the next unchecked `plan.md` item.
3. Inspect git status and recent commits.
4. State the intended work unit.
5. Append a start entry if the work unit is material.

## End-of-work-unit procedure

1. Run the relevant verification.
2. Review changed files and git status.
3. Append the outcome and evidence.
4. Update `plan.md`, ADRs, and open questions if affected. (The rubric
   checklist is the external planning package's artifact, not a file in this
   repo — see `docs/verification/` for its one-time audit.)
5. Only then report completion.

## Phase audit

At the end of each major phase, a bounded review subagent may compare:

- Timeline entries
- `plan.md`
- Git commits
- Changed files
- Test/deployment evidence
- Rubric checklist

The subagent reports omissions to the primary agent. The primary agent verifies
and appends corrections; the subagent does not rewrite history directly.
