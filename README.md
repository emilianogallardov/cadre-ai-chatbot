# Cadre AI Support Concierge

A public customer-support chatbot for [Cadre AI](https://www.cadreai.com) — an
AI strategy and implementation consultancy. Built as a take-home challenge.

**Live:** https://cadre-ai-chatbot.vercel.app

It answers common inbound questions from a curated, source-linked knowledge
base; refuses to invent pricing, portal instructions, bookings, or security
guarantees; routes what it can't answer to a verified human-contact path;
captures consented escalation leads with their conversation context; and
stores conversations under privacy controls that are enforced in code, not
just promised (notice at collection, Private mode, Delete this chat,
automated 30-day retention). Browser voice input (speech-to-text) is
a progressive enhancement; text chat is canonical.

## Architecture in 30 seconds

```
Browser ── NDJSON stream ── POST /api/chat
                              │  1. shape validation (roles, counts, char caps)
                              │  2. rate limits (per-IP sliding window → global daily cap)
                              │  3. prompt assembly (policy + curated KB + bounded turns)
                              ▼
                        OpenRouter gateway ── model is a config value (benchmarked)
                              │
                              ▼
                streamed text + deterministic action cards
                              │
              after(): store the turn (unless Private mode) ──→ Supabase
                              │
             escalation card → POST /api/escalations → Supabase (lead + link)
```

- **Curated knowledge, not RAG** — the corpus that answers the required
  scenarios is 14 sourced entries (~9.6KB JSON, ~5K characters of answer
  text). It fits in the prompt with room to spare; retrieval would add
  failure modes to fetch the same corpus every time
  ([ADR-001](docs/decisions/ADR-001-curated-knowledge-before-rag.md)). The
  raw site crawl never enters the model's context; answers are constrained
  to the curated layer by grounding rules that are pinned by unit tests and
  measured live against the deployed bot (`npm run quality`).
- **Every gate runs before money is spent** — validation, then the limiter,
  then assembly; only then does the request touch the metered key
  ([ADR-006](docs/decisions/ADR-006-upstash-rate-limiting.md)).
- **Model chosen by benchmark, not preference** — three candidates, identical
  prompts through the production code path, automated boundary checks, live
  pricing. In the final 2026-07-11 run, Claude Haiku 4.5 (selected) and
  Claude Sonnet 4.5 (fallback) pass all ten scenarios; GPT-5 Mini fails both
  the substance bar (5/10) and the 3s first-token latency gate (5.3s median),
  so the cheapest model was rejected on evidence. The selection rule itself
  was amended openly along the way — from cost-only to cost-plus-quality-
  plus-responsiveness — and the correction trail lives in the ADR
  ([ADR-007](docs/decisions/ADR-007-model-selection-by-benchmark.md), full
  report in [docs/benchmarks/](docs/benchmarks/)).
- **Storage with privacy by construction** — conversations are stored
  (default-on with notice at collection) so escalation leads arrive with
  their context and content gaps become visible; every privacy claim is
  enforced in code: a `/privacy` page (CalOPPA), an honest Private-mode
  toggle, a Delete-this-chat control, pg_cron-enforced 30-day retention, and
  HMAC-signed conversation ids
  ([ADR-008](docs/decisions/ADR-008-conversation-storage-with-private-mode.md),
  which supersedes half of ADR-002). Escalations remain a consented, minimal
  lead with a 3-per-IP-per-day cap
  ([ADR-005](docs/decisions/ADR-005-minimal-escalation-data.md)). RLS is
  enabled with zero policies on every table — there is no public read or
  write path (proven live: anon reads return `[]`, anon inserts 401).
- **Actions are deterministic** — informational cards (strategist contact,
  Maturity Index, portal help) are selected server-side from the turn's text,
  never model-emitted; card URLs can only be the verified contact page
  ([ADR-004](docs/decisions/ADR-004-structured-tools.md)).

## Run it

```bash
npm install
cp .env.example .env.local   # fill in what you have; everything degrades
npm run dev
```

With no env at all, the app runs fully in dev/preview: chat serves a labeled
mock stream, rate limiting uses an in-memory fallback (warn-once), and
escalations go to a non-durable in-memory store. Production deliberately does
NOT degrade this way for the model and storage: a keyless production deploy
answers with a typed 503 and an unconfigured escalation store fails into the
direct-contact fallback, so a broken deployment can never look healthy. The
one documented exception is rate limiting, which falls back to per-instance
memory until the Upstash variables are provisioned (see Known limitations).
Each credential you add flips that slice to real:

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Real model responses (server-only) |
| `OPENROUTER_MODEL` / `OPENROUTER_FALLBACK_MODEL` | Benchmark winner / runner-up (config, not code) |
| `OPENROUTER_MAX_TOKENS` | Per-turn response cap (bounded worst-case cost) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Durable rate limiting (serverless instances share no memory) |
| `RATE_LIMIT_*` | Tunable caps (per-IP/min, global/day, escalations/IP/day, deletes/IP/day) |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | Durable escalation + conversation storage (server-only; key never reaches the client) |
| `CONVERSATION_SIGNING_SECRET` | HMAC key for conversation tokens; without it, conversation storage silently disables (ADR-008) |

```bash
npm run verify      # lint + typecheck + tests + production build
npm run benchmark   # ADR-007 harness (spends the key in .env.local deliberately)
```

## Layout

```
data/curated/knowledge-base.json   # the model's entire world: 14 sourced entries + policy
src/lib/prompt/                    # prompt assembly (pure; policy + KB + bounded turns)
src/lib/gateway/                   # OpenRouter client (all provider detail lives here)
src/lib/limits/                    # per-IP + global + escalation limits, fail-closed
src/lib/actions/                   # deterministic action-card selection
src/lib/escalations/               # validation + PostgREST store (consented leads)
src/lib/conversations/             # signed tokens + transcript store (ADR-008)
src/app/api/chat/                  # the model-spending route, gates in order
src/app/api/escalations/           # lead write + conversation link
src/app/api/conversations/         # DELETE — the "Delete this chat" control
src/app/privacy/                   # notice-at-collection page (every claim enforced)
src/components/chat/               # UI: transcript, composer, cards, voice hooks
scripts/benchmark.ts               # model-selection harness
docs/decisions/                    # ADR-001…008 — every cut has a trigger to revisit
docs/SCALING.md                    # measured load results, cost ceilings, context strategy
scripts/loadtest.mjs               # repeatable load harness (localhost mock by default, spend-guarded)
scripts/quality-metrics.ts         # answer-quality harness (contact cooldown, voice, synthesis probes; explicit spend)
docs/ai-workflow-log.md            # real record of AI delegation on this project
ACTIVITY-TIMELINE.md               # append-only build log with evidence per entry
skills/                            # the methods that built this repo (with anti-patterns)
supabase/migrations/               # escalations + conversations/messages: RLS on, no policies, pg_cron retention
```

## Deliberately out of scope

Each cut is an ADR with the trigger that would reverse it:

- **Auth / portal replica** — no required scenario needs identity; Cadre's
  public site exposes no portal URL to integrate against (ADR-002)
- **RAG / vector store** — until the corpus outgrows the prompt budget (ADR-001)
- **Realtime voice stack** — browser Web Speech API is the right size until
  voice is a required channel (ADR-003)
- **CRM handoff, analytics, staff notification** — production concerns with no
  take-home evidence value

## Known limitations

- Saved follow-up requests are not pushed to staff — there is no notification
  pipeline or CRM handoff (out of scope, above), so the team works from the
  stored table and the UI copy promises only that the request is saved.
  Production trigger: staff notification on insert.
- Escalation consent is a checkbox, not a verified-email flow; the per-IP
  daily cap is the spam control. Production trigger: email verification.
- After the tab closes, an anonymous visitor has no self-service way to
  delete a stored conversation (no accounts, by design) — the privacy page's
  contact path covers it, and self-service deletion beyond the session is the
  documented production step (ADR-008).
- The privacy-policy text demonstrates the engineering of compliance; in
  production it gets legal review before shipping.
- English-only: the knowledge base, prompts, and UI copy are English; a
  non-English question gets a best-effort model reply grounded in the same
  English corpus. Production trigger: localized KB + language detection.
- No user-feedback affordance (thumbs up/down) yet — adding one is new data
  collection, so it ships together with its privacy-page/KB update per this
  repo's storage rule. Production trigger: first content-quality review
  cycle.
- Web Speech recognition quality is engine-dependent (Chrome-first by design;
  all controls vanish elsewhere).
- `npm audit` reports 2 moderate advisories in the Next.js toolchain whose fix
  requires a canary major; accepted for this exercise.

## How it was built

Claude Code (Fable 5) orchestrated the build: parallel subagents implemented
modules against pinned interface contracts, the orchestrator independently
re-verified and committed everything, and an external adversarial reviewer
(Codex / GPT-5.6) audited each increment's diff across eleven rounds — several
of its findings changed the design, and a few were declined with recorded
rationale. This was deliberate methodology, not one-shot generation: the
repeatable methods used — adversarial review, root-cause debugging,
design-before-code, and refute-before-trust verification — are documented as
[`skills/`](skills/README.md), each with the anti-patterns it exists to
prevent. The full, non-retrospective record is in
[docs/ai-workflow-log.md](docs/ai-workflow-log.md) and
[ACTIVITY-TIMELINE.md](ACTIVITY-TIMELINE.md).
