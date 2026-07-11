---
name: adversarial-verification
description: Don't accept a claim until an independent pass tries to refute it. Use for findings, metrics, and "it works" claims — especially your own.
---

# Adversarial Verification — refute before you trust

## When to use
Whenever a claim would be embarrassing to get wrong: a review finding, a
performance number, a "the boundary holds" assertion, or a "this is done"
before submission. Applies hardest to your *own* claims — they get the least
scrutiny by default.

## The method
1. **Spawn an independent perspective.** A fresh agent or a second model with
   no stake in the original claim, prompted to *refute* it, not confirm it.
2. **Prefer diversity over repetition.** If a finding can fail in more than one
   way, give verifiers distinct lenses (correctness, security, does-it-repro)
   rather than N identical checks.
3. **Measure, don't assert.** Replace "it feels faster / safer / better" with a
   number from a repeatable harness, and keep the raw data.
4. **Default to skeptical.** If a verifier is uncertain, treat the claim as
   unproven. Surviving refutation is the bar, not passing a friendly check.

## How it was used on this project
- **Blind-agent audits (T-060, T-062):** fresh agents with no project
  knowledge were pointed at the repo to test whether the governance is actually
  discoverable, and whether a skeptical reviewer would trust it. Different model
  tiers were run to compare. Two independent auditors converged on the same
  residual findings — that convergence is the signal.
- **Measured answer-quality (`docs/benchmarks/`):** the "trust-building"
  claim was replaced by a scripted harness with committed baseline/after
  numbers, not vibes.
- **Live durability sweep:** ~40 adversarial probes (malformed input, prompt
  injection, retry double-writes, unauthorized delete) each verified against
  the database, then the test data deleted.

## Anti-patterns (what not to do)
- **Don't self-certify.** "I checked, it's fine" is the claim, not the
  verification. Make something independent try to break it.
- **Don't confirm when you meant to refute.** A verifier prompted to agree will
  agree. Prompt it to find the failure.
- **Don't overclaim from thin evidence.** One uncontrolled run is a data point,
  not a proof — this project explicitly re-scoped "O(1) proven live" to "no
  slowdown observed in one run" after review. Say exactly what the evidence
  shows.
- **Don't leave verification unrecorded.** If the refutation attempt isn't
  written down, no one can trust it happened.
