# Round 13 — final verification (Fable subagent + Codex cross-check)

- Trigger: owner asked for one last independent review before submitting.
  Requested a **Fable** (Claude) subagent as the primary reviewer; a Codex pass
  that was already running is kept as a cross-check.
- Both reviewed commit `dd0aa7a` independently, read-only.

## Verdicts
- **Fable subagent: SHIP.** Ran the gate itself (307 pass, exit 0), verified
  prod = HEAD, and — decisively — **refuted the Codex "New chat race" BLOCKER**
  with a concurrency walk-through: newChat is blocked while `deleting`; delete
  is blocked while streaming AND guarded by the synchronous
  `beginConversationDeletion` flag that `send()` checks; the abort-then-reset
  ordering is safe because the stream loop is suspended in a pending
  `reader.read()` that rejects with AbortError and microtasks drain before the
  next task. No stale `setItems` can fire against the cleared transcript.
- **Codex: FIX-FIRST.** Its BLOCKER was the New-chat race (refuted above). Its
  real contributions were two regex imprecisions, which Fable independently
  confirmed as MED/benign.

## Fixed (both reviews agreed)
| Finding | Fix |
|---|---|
| `ESCALATION_REQUEST` someone/team/cadre branch had no visitor-direction anchor — fired on "Does your team follow up with clients?", "How often will Cadre be in touch?" | Branch now requires the contact verb be followed within 15 chars by `me/us/my`; removed the unanchored standalone `be in touch`/`hear back`. 6 false positives pinned as tests |
| `FORM_MENTION` `the form` matched the idiom "in the form of workshops" (and could cause a false benchmark card-mismatch) | Guarded `this/the/a form` with `(?! of\b)`. 2 idiom cases pinned as tests |
| ADR-008 amendment claimed the Privacy link was persistent in the header — it is in the header only via the Private toggle; the Privacy link is first-run | Amendment corrected: Private-mode toggle persistent in header, Privacy link in the first-run notice, `/privacy` reachable at its URL |
| "eleven rounds" in README + skills/ | → "a dozen rounds" |

Verified after fix: 17/17 reviewer-flagged cases correct (10 false-positives
now cardless, 7 genuine requests/form-mentions still escalate); `npm run verify`
25 files / **315 tests** exit 0.

## Verified CORRECT by the Fable review
newChat token retention matches the ADR-008 amendment with no reachable race;
ADR-003 microphone-only accurate (zero `speechSynthesis` in src/); skills/
frontmatter valid with **no personal/business/secret leakage** (only identity
string in the repo is the public submission URL); golden-rule coverage
(`SCENARIO_CHECKS`) covers all six scenarios + every boundary with the global
leak scan; prod `/api/health` self-reports `dd0aa7a` (= HEAD); only
`.env.example` tracked; the sole "degraded" signal is the known pending Upstash
item.

**Net verdict: SHIP** once the two regex refinements land (done here).
