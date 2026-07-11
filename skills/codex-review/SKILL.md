---
name: codex-review
description: Adversarial external review — after each meaningful increment, have a second, independent model try to break it. Use before claiming an increment is done, not after.
---

# Codex Review — adversarial second-model review loop

## When to use
After any increment that changes behavior, a boundary, or a public claim —
before you call it done. The point is to surface what your own pass is blind
to, so run it *between* increments, not once at the end.

## The method
1. **Bundle the context.** A reviewer with no memory of your session needs the
   diff, the relevant files, and the specific claim under test stated plainly.
   Vague "review this" prompts get vague findings.
2. **Ask it to be adversarial and decisive.** "Find what's wrong, rank by
   severity, give file:line evidence, end with a SHIP / FIX-FIRST verdict."
3. **Adjudicate every finding in writing.** For each: confirm, fix, or reject
   with a reason. Record the round in `docs/reviews/` so the decision is
   auditable.
4. **Re-run after fixing.** A fix can introduce a new defect; the loop closes
   only when a round comes back clean or with nothing actionable.
5. **Change the review axis over rounds.** General passes plateau. Point later
   rounds at a specific lens (UI-only, evidence-only, answer-quality-only) —
   focused scope finds what repeated general passes miss.

## How it was used on this project
Eleven rounds, one written adjudication each in `docs/reviews/`. The score arc
(6.5 → 8.3/10) and the specific catches are traceable per round. Round 9's
UI-only lens found a delete/send race that six general passes had missed;
round 10 shifted the axis from "is it correct?" to "is it useful?" and found a
confident-invention-by-synthesis bug; round 11 was a pre-submission
buttoned-up sweep that caught documentation drift (a stale benchmark claim
that contradicted the final result).

## Anti-patterns (what not to do)
- **Don't trust a single pass.** One reviewer, one angle, misses things.
  Multiple rounds with changing scope is the unit of confidence, not one review.
- **Don't act on a finding you haven't verified.** Reviewers are confidently
  wrong sometimes. This project's benchmark assertions were themselves
  review-corrected *three times* (ASCII-vs-Unicode apostrophes falsified a
  score; a legitimate refusal read as a failure). Verify before you "fix."
- **Don't let the reviewer edit.** Keep it read-only. The reviewer proposes;
  you adjudicate and implement. That separation is what makes it a check.
- **Don't skip the write-up.** An unrecorded review is unfalsifiable. The
  `docs/reviews/` record is what lets a third party trust the loop happened.
- **Don't confuse "reviewed" with "fixed."** Track findings to a resolution;
  a review with open items is not a closed review.
