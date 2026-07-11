# Spec: load-test tooling + scaling plan document

- Goal: replace "it's serverless, it scales" hand-waving with a repeatable
  measurement tool and a written plan with real ceilings. Feeds the Tuesday
  review question "how does this scale?" with data.

## Part 1 — `scripts/loadtest.mjs` (zero new dependencies)

A plain Node script (Node 20+, global fetch) that drives concurrent chat
turns against a target and reports latency/status statistics.

CLI:
```
node scripts/loadtest.mjs --url http://localhost:3000 \
  --concurrency 25 --duration 30 [--scenario short|long]
```

Behavior:
1. Default target is LOCALHOST. The script REFUSES to run against a
   non-localhost URL unless `--i-know-this-spends` is passed — the deployed
   app has a real metered key and a global daily cap; hammering prod is a
   spend event and a self-DoS. Print that explanation on refusal.
2. Each virtual user loops: POST /api/chat with a valid single-turn payload
   (scenario `short`) or a full 12-message window near the char budget
   (scenario `long`), reads the NDJSON stream to completion, records:
   time-to-first-byte, time-to-done, HTTP status, terminal event type
   (done/error), and any malformed-NDJSON line.
3. Rate-limit awareness: 429s are counted as their own bucket (they are
   CORRECT behavior under load, not failures) and honored — the virtual user
   sleeps `Retry-After` before continuing.
4. Report (console + `--json` flag for machine output): request count,
   status buckets (200/429/4xx/5xx), malformed-stream count, TTFB and
   total-time p50/p95/p99, throughput/sec. Exit non-zero if any 5xx or
   malformed stream occurred.
5. Keep it ~200 lines, dependency-free, readable — it will be read by a
   reviewer, not just run.

## Part 2 — `docs/SCALING.md`

Structure (write the analysis; leave measured-number cells as `_TBD_` — the
orchestrator fills them from real runs the same night):

1. **What scales by construction** — stateless serverless functions (no
   session affinity; conversation state lives in the browser + Supabase);
   post-response storage via `after()`; bounded prompt window (12 turns /
   8000 chars) so context cost per turn is O(1) regardless of session
   length; the client sends a rolling window that is valid by construction
   (docs/specs/2026-07-10-session-window.md).
2. **The ceilings, in order of arrival** —
   (a) the global daily cap: a deliberate cost governor for a metered key,
   not an architectural limit — scaling step one is raising a number and a
   budget (measured cost/turn table: haiku ~$0.0024 measured average per docs/SCALING.md $2a — superseding this spec's earlier estimate — from the 2026-07-11
   benchmark; worked examples at 1k/10k/100k turns per day);
   (b) limiter durability: in-memory counters multiply across warm
   instances — Upstash flips this to durable shared counters (env vars
   already wired, provisioning is a dashboard step);
   (c) OpenRouter throughput (per-model TPM) — mitigations: fallback model
   routing (already configured), then multi-provider;
   (d) Supabase writes — trivial at this scale; `after()` already decouples
   them from reply latency.
3. **Context strategy** — the 12-turn window is the whole strategy today,
   and why that is CORRECT for support chat (each question mostly
   self-contained; escalation captures context durably). The documented
   trigger for summarization/embedding-recall, and why not now (YAGNI, adds
   failure modes and latency to every turn).
4. **Measured results** — table filled from `scripts/loadtest.mjs` runs
   (local mock path: full HTTP/NDJSON/validation/limiter pipeline, zero
   spend) and one small controlled live-prod burst within the daily budget:
   concurrency, duration, p50/p95 TTFB, p50/p95 total, status buckets,
   verdict lines. Include the session-endurance result (50-turn session
   green in CI-grade tests).
5. **What we would do at 10× / 100×** — concrete, short: provision Upstash
   + raise caps; add provider-level concurrency queueing; regional
   read-replica for conversation reads if a dashboard ever exists; CDN-edge
   caching does NOT apply (every response is personalized) — say so.

## Hard constraints

- Files: `scripts/loadtest.mjs` (new), `docs/SCALING.md` (new). Nothing
  else. No new npm dependencies.
- NEVER run the script against the deployed URL yourself; local-only proof:
  run `npm run build && npm start` (or `next start` on a port), one short
  smoke run (e.g. concurrency 5, duration 10s) to prove the tool works, and
  include its output in the handoff. If the local server can't start in
  your environment, say so and hand off with the script statically
  verified via `node --check`.
- Do not commit; do not touch timeline/plan/README.
- `npm run verify` must stay green (script is not in the test path but must
  pass lint).
