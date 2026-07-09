# Cadre AI Support Concierge

A public customer-support chatbot for [Cadre AI](https://www.cadreai.com) — an
AI strategy and implementation consultancy. Built as a take-home challenge.

**Live:** https://cadre-ai-chatbot.vercel.app

It answers common inbound questions from a curated, source-linked knowledge
base; refuses to invent pricing, portal instructions, bookings, or security
guarantees; routes what it can't answer to a verified human-contact path; and
captures consented escalation leads — the app's single database write. Browser
voice (speech in, opt-in read-aloud) is a progressive enhancement; text chat is
canonical.

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
             escalation card → POST /api/escalations → Supabase (the one write)
```

- **Curated knowledge, not RAG** — the corpus that answers the required
  scenarios is 12 sourced entries (~3KB). It fits in the prompt with room to
  spare; retrieval would add failure modes to fetch the same 3KB every time
  ([ADR-001](docs/decisions/ADR-001-curated-knowledge-before-rag.md)). The
  model receives only this layer — it cannot leak facts it was never given.
- **Every gate runs before money is spent** — validation, then the limiter,
  then assembly; only then does the request touch the metered key
  ([ADR-006](docs/decisions/ADR-006-upstash-rate-limiting.md)).
- **Model chosen by benchmark, not preference** — three candidates, identical
  prompts through the production code path, automated boundary checks, live
  pricing. All three passed; the cost-only rule was amended openly with a
  responsiveness gate when results showed the cheapest model had 5.7s median
  first-token latency
  ([ADR-007](docs/decisions/ADR-007-model-selection-by-benchmark.md), full
  report in [docs/benchmarks/](docs/benchmarks/)).
- **One database write** — `create_escalation`: a consented, validated,
  minimal lead (name, email, question, server-stamped consent timestamp) with
  a 3-per-IP-per-day cap. Conversations are deliberately never stored
  ([ADR-002](docs/decisions/ADR-002-no-auth-or-persistent-transcripts.md),
  [ADR-005](docs/decisions/ADR-005-minimal-escalation-data.md)). RLS is
  enabled with zero policies — there is no public read or write path.
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

With no env at all, the app runs fully: chat serves a labeled mock stream,
rate limiting uses an in-memory fallback (warn-once), and escalations go to a
non-durable in-memory store. Each credential you add flips that slice to real:

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Real model responses (server-only) |
| `OPENROUTER_MODEL` / `OPENROUTER_FALLBACK_MODEL` | Benchmark winner / runner-up (config, not code) |
| `OPENROUTER_MAX_TOKENS` | Per-turn response cap (bounded worst-case cost) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Durable rate limiting (serverless instances share no memory) |
| `RATE_LIMIT_*` | Tunable caps (per-IP/min, global/day, escalations/IP/day) |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | Durable escalation storage (server-only; key never reaches the client) |

```bash
npm run verify      # lint + typecheck + tests + production build
npm run benchmark   # ADR-007 harness (spends the key in .env.local deliberately)
```

## Layout

```
data/curated/knowledge-base.json   # the model's entire world: 12 sourced entries + policy
src/lib/prompt/                    # prompt assembly (pure; policy + KB + bounded turns)
src/lib/gateway/                   # OpenRouter client (all provider detail lives here)
src/lib/limits/                    # per-IP + global + escalation limits, fail-closed
src/lib/actions/                   # deterministic action-card selection
src/lib/escalations/               # validation + PostgREST store (the one write)
src/app/api/chat/                  # the model-spending route, gates in order
src/app/api/escalations/           # the mutating route
src/components/chat/               # UI: transcript, composer, cards, voice hooks
scripts/benchmark.ts               # model-selection harness
docs/decisions/                    # ADR-001…007 — every cut has a trigger to revisit
docs/ai-workflow-log.md            # real record of AI delegation on this project
ACTIVITY-TIMELINE.md               # append-only build log with evidence per entry
supabase/migrations/               # escalations table: RLS on, no policies, CHECK constraints
```

## Deliberately out of scope

Each cut is an ADR with the trigger that would reverse it:

- **Auth / portal replica** — no required scenario needs identity; Cadre's
  public site exposes no portal URL to integrate against (ADR-002)
- **Persistent transcripts** — privacy obligation with no user benefit (ADR-002)
- **RAG / vector store** — until the corpus outgrows the prompt budget (ADR-001)
- **Realtime voice stack** — browser Web Speech API is the right size until
  voice is a required channel (ADR-003)
- **CRM handoff, analytics, staff notification** — production concerns with no
  take-home evidence value

## Known limitations

- Escalation consent is a checkbox, not a verified-email flow; the per-IP
  daily cap is the spam control. Production trigger: email verification.
- The 30-day escalation retention policy is documented (migration comment),
  not yet automated — a scheduled deletion job is the production step.
- Web Speech recognition quality is engine-dependent (Chrome-first by design;
  all controls vanish elsewhere).
- `npm audit` reports 2 moderate advisories in the Next.js toolchain whose fix
  requires a canary major; accepted for this exercise.

## How it was built

Claude Code (Fable 5) orchestrated the build: parallel subagents implemented
modules against pinned interface contracts, the orchestrator independently
re-verified and committed everything, and an external adversarial reviewer
(Codex / GPT-5.5) audited each phase's diff — several of its findings changed
the design, and a few were declined with recorded rationale. The full,
non-retrospective record is in
[docs/ai-workflow-log.md](docs/ai-workflow-log.md) and
[ACTIVITY-TIMELINE.md](ACTIVITY-TIMELINE.md).
