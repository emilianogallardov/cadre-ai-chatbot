# Codex round 9 — focused UI-layer review (GPT-5.6 Sol)

- Trigger: the owner asked for a dedicated review of the accumulated UI work
  before merge/submission. The premium surface pass, polish branch, and
  ADR-008 client plumbing had each been reviewed as increments but never as
  a consolidated front-end — this pass covered the merged whole (components,
  client hooks, storage, markdown rendering, globals.css, privacy page).
- Verdict: **FIX-THEN-ACCEPT — 1 HIGH, 8 MED, 2 LOW.** All 11 accepted and
  closed in `3c8a146`. The focused lens earned itself: five general-repo
  rounds and a grading pass had all missed the HIGH.

## Findings and resolutions

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | HIGH | Delete can race a new send: while the DELETE fetch is pending, `send()` never checks the deletion and the composer stays enabled — a new turn reuses the token being deleted, the post-stream store recreates the conversation server-side, and the client has already cleared its only deletion handle while announcing success | Synchronous module flag in conversationStorage (`begin/end/isConversationDeletionInProgress` — React state flushes too late for this): `send()` refuses mid-delete, the composer disables while deleting, and escalation submits mid-delete store unlinked. Flag covered by tests |
| 2 | MED | Error draft-restore overwrites text typed during a streaming reply (the input stays editable; failure unconditionally published the submitted text as the composer's new value) | Restore applies only to an EMPTY composer — the visitor's newer words win; the draft id is consumed either way so a later manual clear can't resurrect it. Error copy no longer claims "your message is back in the box" |
| 3 | MED | Submit called `recognition.stop()`, which may still deliver one final `onresult` — repopulating the just-cleared composer with dictation that was already sent | New `cancel()` on useSpeechInput detaches `onresult` BEFORE aborting; submit uses cancel(), the mic toggle keeps graceful stop() so ordinary dictation still commits its final result |
| 4 | MED | Verified-link gating covered only anchors: `![x](https://attacker.example/pixel)` in model output still rendered a remote image — tracking requests, visual impersonation | `img` renders alt text only (never an element that fetches); markdownComponents exported and pinned by rendering-safety tests for anchors (verified → hardened link, unverified → text) and images (alt-only / nothing) |
| 5 | MED | Keyboard users couldn't scroll the transcript at all: the scroll container was a non-focusable div and the fixed-height shell offers no page-level scrolling — the "Latest" pill state was unreachable by keyboard | `tabIndex={0}` + visible inset focus outline on the scroll container |
| 6 | MED | Three transitions removed the focused control without moving focus: delete success unmounts the Delete button, a suggested-prompt pick unmounts the rail, escalation success replaces the focused form | Composer refocused after delete success and prompt pick; the "Request received" heading gets `tabIndex={-1}` and receives focus on the submit transition (not when mounting already-confirmed from the session cap) |
| 7 | MED | The whole log is `aria-live="polite"` while streaming reparses the markdown subtree per token — screen readers narrate partial text repeatedly restructuring into headings/links | `aria-busy={streaming}` on the log so announcements wait for the settled reply |
| 8 | MED | Escalation session cap silently never advanced when storage reads work but writes throw (quota): the write-failure fallback counter was ignored by successful reads | Mirror counter ALWAYS advances; reads return max(stored, mirror). Pinned by read-success/write-throw, storage-gone, and persistence tests |
| 9 | MED | Residual dark-mode contrast: the per-message "Cadre AI" eyebrow (zinc-500 ≈ 4.10:1) and both privacy-page secondary labels (neutral-500 ≈ 4.18:1) — round 8 fixed the empty-state twin but not these | `dark:text-zinc-400` / `dark:text-neutral-400` added. (The orchestrator's pre-read independently flagged the eyebrow before the review returned) |
| 10 | LOW | The mic's `animate-pulse` ignored `prefers-reduced-motion` while the custom animations respect it | `motion-reduce:animate-none` |
| 11 | LOW | "New tab starts fresh" overclaims sessionStorage semantics: duplicated/opener-created tabs inherit a copy and then diverge without synchronizing | Comment reworded to browsing-context semantics with the divergence named and why it's acceptable (the copied token is the visitor's own; each tab forks its own conversation) |

## Confirmed clean (reviewer-verified)

- Same-tick double sends guarded; every fetch/parse/stream failure path
  releases `inFlightRef`.
- EOF-without-`done` reaches the visible error surface; server-typed stream
  errors are preserved verbatim.
- Private mode latches into each request; blocked storage keeps
  token/private state in memory for the page's life.
- Autolinks and reference links pass through the same gated anchor renderer;
  raw HTML stays escaped; JavaScript/lookalike URLs stay rejected.
- The rolling payload window drops empty stopped turns, keeps the newest
  overflowing retry, stays within server caps, preserves user-ending
  alternation.
- Round-8 touch-target and reduced-motion work held up.

## Closure evidence

Gate 26 files / 287 tests green (10 new: markdown rendering safety, quota
counting, deletion flag) + production build; commit `3c8a146`; log
`codex-round9-ui-review.log` (172K tokens) in session records. Push, deploy,
and live smoke follow in T-055's evidence.
