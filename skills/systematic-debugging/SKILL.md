---
name: systematic-debugging
description: A four-phase method that forces understanding a bug before proposing a fix. Use on any bug, test failure, or surprising behavior — especially when the fix seems obvious.
---

# Systematic Debugging — root cause before fix

## When to use
Any bug, failing test, or behavior that surprised you. The more obvious the
fix looks, the more this matters — an obvious fix for a misunderstood cause
just moves the bug.

## The method
1. **Investigate the root cause.** Read the code path that actually runs. Trace
   the real inputs to the real output. State the mechanism in one sentence
   before touching anything.
2. **Analyze the pattern.** Is this an instance of a class? Does the same flaw
   exist elsewhere? A single symptom often points at a systemic gap.
3. **Test the hypothesis.** Prove the cause with evidence (a reproduction, a
   log, a DB row) before writing the fix. If you can't reproduce it, you don't
   understand it yet.
4. **Implement, then verify against the original symptom.** Fix the cause, add
   a test that pins the exact case, and confirm the original repro is gone.

## How it was used on this project
The live escalation-form bug (T-070): the bot pointed a user at "a form just
below this chat" and no form appeared. The obvious "fix" would have been to
change the bot's wording. Tracing the actual code path (`selectActionCards`)
found the real cause: the form only rendered on a user-intent keyword or an
"I can't answer" signal, and that turn had neither. The fix targeted the
cause (add explicit escalation triggers, including one that fires whenever the
assistant *mentions* the form) and pinned it with 14 tests including the exact
turn. Verified live against production before claiming done.

## Anti-patterns (what not to do)
- **Don't fix the symptom.** Rewording the bot would have hidden the defect
  while leaving the real gap (the selector) in place.
- **Don't skip reproduction.** "It's probably X" is a guess. This project
  repeatedly confirmed causes against the live database and network timings
  before acting — including one case where a "bug" turned out to be
  correct-by-design (storage requires a dedup key; it fails safe).
- **Don't stop at the first instance.** Ask whether the same class of bug lives
  elsewhere. A brittle refusal regex here was found to miss novel phrasings —
  the *third* time that class recurred — so the fix broadened the pattern and
  pinned the observed shapes.
- **Don't claim "fixed" without re-running the original symptom.** A green
  unit test is necessary, not sufficient; reproduce the user's path.
