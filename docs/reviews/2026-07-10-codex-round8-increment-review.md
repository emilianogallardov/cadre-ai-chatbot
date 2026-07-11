# Codex round 8 — CI/health/accessibility increment review (GPT-5.6 Sol)

- Trigger: standing loop — every increment gets its adversarial pass before
  it counts. Scope: commits `b4797fd` (round-7 grading residuals) and
  `64f01cd` (CI workflow, /api/health, WCAG touch targets + contrast,
  limitations honesty).
- Verdict: **FIX-THEN-ACCEPT. No HIGH findings.** Six findings (3 MED,
  3 LOW) — all closed same hour in `9fd999a`.

## Findings and resolutions

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | MED | The placeholder contrast FIX regressed dark mode: `placeholder:text-zinc-500` passes on white (4.83:1) but ≈3.67:1 on zinc-900 — and four PRE-EXISTING eyebrow labels shared the problem | `dark:placeholder:text-zinc-400` on the composer + `dark:text-zinc-400` on eyebrow labels across Chat/Transcript/ActionCardView/EscalationCard |
| 2 | MED | The 44px coarse-pointer rule missed two actual buttons: the always-present private-mode notice toggle and the conditional "Latest" pill (~28px on touch) | Shared `.tap-target` utility added to the coarse-pointer rule and applied to both (first attempt produced a duplicate `className` JSX prop the gate caught — merged into one) |
| 3 | LOW | Public health output names the exact protection posture (`durableRateLimit:false` tells an attacker the cap is per-instance) and "ok" only proves strings are present | Accepted deliberately and documented in-code: the source is public and the repo's own docs state the limiter posture, so the booleans reveal nothing a repo reader lacks; closed-source alternative (aggregate-only) named; "configured ≠ valid credentials" stated |
| 4 | MED | "CI needs no secrets" not literally true — GitHub mints a job token automatically and `checkout@v4` persists it by default; PR-controlled scripts run under it | `permissions: contents: read` + `persist-credentials: false`; header comment corrected |
| 5 | LOW | "Every push" was false — `push.branches: [main]` runs only for main pushes | Comment now says "every main push and pull request" |
| 6 | LOW | Spend unification missed two historical docs (workflow log ~$2/day; load-test spec ~$0.0008/turn) | Both annotated "superseded by docs/SCALING.md §2a" — historical text preserved, not rewritten (append-only discipline) |

## Confirmed clean

- The health handler imports no gateway/store clients — it cannot spend
  money or touch the database.
- The private-mode tooltip, notice, privacy page, and KB now consistently
  scope the promise to new messages.
- `npm run verify` exactly matches the README claim: lint, typecheck,
  tests, production build.

## Closure evidence

Gate 25 files / 277 tests green (H4 no-store test added this round); commit
`9fd999a` pushed; prod redeployed and header-smoked (`cache-control:
no-store` confirmed live); GitHub Actions run green in 41s under the newly
scoped token. Timeline T-054; log `codex-round8-increment.log` (156K
tokens) in session records.
