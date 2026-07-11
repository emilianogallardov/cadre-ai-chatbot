# Codex round 12 — final pre-submission review (GPT-5.6 Sol)

- Trigger: owner asked for a final review before submitting. Scope: everything
  that changed since round 11 (`ef44517..2a04e13`) — the escalation-form fix,
  the mobile UI rework, read-aloud removal, and the new `skills/` folder — plus
  a final consistency + optics sweep.
- Verdict: **FIX-FIRST — 2 BLOCKER / 2 HIGH / 2 MED / 1 LOW.** All resolved
  the same session. The review was genuinely valuable: it caught two real
  privacy-contract gaps the increment-by-increment UI work had introduced.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | BLOCKER | `New chat` dropped the conversation token while leaving the record stored — the Delete control (keyed on the token) could no longer reach it, breaking ADR-008's self-service deletion contract | `newChat` now KEEPS the token (Chat.tsx): fresh screen + fresh model context, same stored id, still deletable. FK is `ON DELETE SET NULL` so leads are unaffected. ADR-008 amended to record it |
| 2 | BLOCKER | "Demo-critical increment not proven deployed" — T-070's entry says "deploy pending" while the skill claims it was verified live | Reconciled: `9bd3e8f` WAS deployed and the form verified live (screenshot + live submission with a DB-confirmed lead, this session) right after T-070 was written. The label was stale, not the work; corrected in T-072. Re-deployed after these round-12 fixes and re-smoked |
| 3 | HIGH | Escalation regexes over- and under-triggered: bare `follow up` / `have someone` fired on informational questions; form detection missed "complete this form" / indirect "call me" | `ESCALATION_REQUEST` anchored on contact-directed-at-visitor; `FORM_MENTION` anchored on the noun `form` + `consent box`. 8 new tests pin Codex's exact false-positives and misses. 44 selector tests pass |
| 4 | HIGH | First-run notice scoping (T-066) diverged from ADR-008's "persistent line under the composer" without an amendment | ADR-008 amended: notice shown at the first-run (at-or-before-collection) screen with Privacy link + Private toggle persistent in the header; rationale recorded (mobile keyboard real estate) |
| 5 | MED | Mic `SESSION_MS` comment claimed a "hard cap" but the deadline is only checked at restart boundaries | Comment corrected to describe the real behavior (a forgotten/idle mic closes within seconds of the cap because engines end on silence; not a wall-clock interrupt of continuous speech). Behavior left unchanged — file is under active mobile-session work |
| 6 | MED | ADR-003 still directed "voice input and output" after read-aloud was removed | ADR-003 amended to microphone-only progressive enhancement |
| 7 | LOW | Verification headline said 295 tests | Updated to 307 (post round 12) with the growth trail |

## What the reviewer cleared
The four `skills/` files have valid frontmatter/layout and **no personal,
business, or secret leakage** (independently scanned); the "11 rounds" claim is
supportable; history and working-tree secret scans clean; only `.env.example`
tracked; no broken links or scaffold clutter; ESLint and typecheck pass. (Fresh
Vitest/build was blocked by the read-only sandbox; the committed 307-test green
was reproduced locally.)

## Evidence
codex-round12-final.log (session records, 180k tokens); `npm run verify` 25
files / 307 tests exit 0; commit + redeploy + live re-smoke recorded in T-072.
