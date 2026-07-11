# Scaling: how this holds up under load

This replaces "it's serverless, it scales" with the actual mechanism, the
ceilings in the order they arrive, and measured numbers from
`scripts/loadtest.mjs`. Run the tool yourself:

```bash
npm run build
OPENROUTER_API_KEY= npm start              # EXPLICITLY keyless — .env.local may hold a real key
node scripts/loadtest.mjs --url http://localhost:3000 \
  --concurrency 25 --duration 30 [--scenario short|long] [--json]
```

`localhost` does not automatically mean zero spend: `next start` loads
`.env.local`, so a developer's real key would make every request a real model
call. Start the server with the key explicitly emptied as above; the tool
ALSO preflights one probe turn and refuses to fan out unless the target
answers with the keyless mock. It refuses non-localhost targets entirely
without `--i-know-this-spends`, because the deployed app spends a metered
OpenRouter key under a global daily cap (ADR-006) — a load test against prod
is a real spend event and a self-inflicted DoS.

## 1. What scales by construction

- **Stateless functions, no session affinity.** `POST /api/chat` holds no
  per-user state between requests. Conversation state lives in the browser (the
  client replays a rolling window each turn) and, when storage is configured,
  in Supabase behind a signed token. Any instance can serve any request, so the
  platform can fan out horizontally without coordination.
- **Post-response storage is off the reply path.** The turn is persisted via
  `after()` (see `src/app/api/chat/route.ts`), so the Supabase write happens
  after the stream closes and never adds to reply latency.
- **Prompt cost per turn is O(1) in session length.** The prompt is the policy
  layer + the curated knowledge base (~5.0K chars of answer text; 9.6KB JSON
  on disk) + a bounded window of recent turns (`LIMITS.promptWindowTurns` =
  12, `maxTotalChars` = 8000) — the benchmark measures the assembled
  single-turn prompt at ~1,550 input tokens. A 5-minute chat and a 2-hour
  chat send the same worst-case token count, so per-turn cost and latency do
  not grow with conversation length.
- **The window is valid by construction.** The client sends only what the server
  will use — `toPayloadMessages` produces a window that always satisfies
  `validateMessages` (`docs/specs/2026-07-10-session-window.md`), so a long
  session never dead-ends on a validation error mid-conversation. Server caps
  stay in place as defense in depth.

## 2. The ceilings, in order of arrival

You hit these in roughly this order as traffic climbs.

### (a) The global daily cap — a cost governor, not an architecture limit
`RATE_LIMIT_GLOBAL_PER_DAY` (default 400) is a deliberate budget guardrail for a
metered key with a fixed $5 credit that must survive until the live review
(ADR-006), not a structural throughput limit. Scaling step one is raising a
number and attaching a budget.

Measured per-turn cost, from the 2026-07-11 benchmark
(`docs/benchmarks/2026-07-11-model-benchmark.md`), token counts estimated at
chars/4, pricing pulled live from the OpenRouter catalog:

| Model | Role | Est. cost / turn (measured range) |
|---|---|---|
| `anthropic/claude-haiku-4.5` | selected | ~$0.002 ($0.0020–$0.0033 across 10 scenarios) |
| `anthropic/claude-sonnet-4.5` | fallback | ~$0.0068 ($0.0057–$0.0090) |
| `openai/gpt-5-mini` | cost floor, excluded on latency | ~$0.0006 |

Two cost numbers matter, derived separately (prices are OpenRouter's live
catalog values the benchmark recorded: Haiku $1/M input + $5/M output,
Sonnet $3/M + $15/M — these reproduce the report's own per-scenario costs
exactly):

- **Measured average**: the final benchmark totals $0.023753 for 10 Haiku
  turns → **~$0.0024/turn**, so the $5 key buys **~2,100 average turns**.
- **Bounded worst case**: benchmark base prompt ~1,550 input tokens + a full
  8,000-char window (~2,000 tokens) ≈ 3,550 input + the 600-token output cap
  → **~$0.0066/turn on Haiku, ~$0.0197/turn if the Sonnet fallback takes the
  request**.

Worked daily spend:

| Turns / day | Haiku avg ~$0.0024 | Haiku worst ~$0.0066 | All-Sonnet worst ~$0.0197 |
|---|---|---|---|
| 400 (current cap) | ~$0.95 | ~$2.62 | ~$7.86 |
| 1,000 | ~$2.40 | ~$6.60 | ~$19.70 |
| 10,000 | ~$24 | ~$66 | ~$197 |

OpenRouter's prepaid credit is the hard backstop: it stops serving when the
credit is exhausted, so no misconfiguration here can overspend the key.
Scaling past the cap is a budget decision, not a rewrite: raise the env var,
fund the key.

### (b) Limiter durability — in-memory counters multiply across instances
The limiter fronts every model call (ADR-006). On serverless, warm instances do
not share memory, so an in-memory global counter becomes N soft counters and the
spend ceiling stops being global. **Upstash Redis flips this to one durable
shared counter.** The code path already exists and prefers Upstash whenever
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set
(`src/lib/limits/ratelimit.ts`); provisioning is a dashboard step, not a code
change. The in-memory fallback is selected in ANY environment lacking the
Upstash variables — including, at the time of writing, the production
deployment (a documented degrade; see the requirements-verification OPEN
list) — and warns loudly. Provisioning Upstash is the standing submission-day
step that turns the documented cap into a durable guarantee. The Upstash
limiter fails closed on a Redis outage — an outage denies with a friendly
429, it does not suspend the budget guarantee.

### (c) OpenRouter throughput — per-model tokens-per-minute
Above some concurrency the binding limit is the provider's per-model TPM, not
our functions. Mitigations, cheapest first:
1. **Fallback model routing** — already configured (`OPENROUTER_FALLBACK_MODEL`
   = `claude-sonnet-4.5`, ADR-007); an overloaded primary spills to the fallback.
2. **Multi-provider** — the gateway makes the model a config value, so adding a
   second provider (or a second key) for the same model class is a config change
   in `lib/gateway/`, not an architecture change.

### (d) Supabase writes — trivial at this scale
One small insert per stored turn, already decoupled from reply latency by
`after()`. Postgres absorbs this volume without tuning far past the ranges above;
it is not a near-term ceiling.

## 3. Context strategy

**The 12-turn / 8000-char window is the whole strategy today, and that is
correct for support chat.** Each inbound question is mostly self-contained
("what does Cadre do?", "reset my portal password", "cost of an engagement"), so
the recent window plus the curated KB is enough to answer well. When a request
genuinely needs continuity, escalation captures the context durably (the lead +
conversation link), so nothing important depends on an unbounded in-prompt
history. The bounded window is also what keeps per-turn cost O(1) (§1).

**Documented trigger for more (summarization / embedding recall):** if real
usage shows multi-topic sessions where answers depend on turns older than the
window — measurable as a rise in "you already told me…" style follow-ups or
escalations citing dropped context. **Why not now (YAGNI):** rolling
summarization and vector recall each add a failure mode and latency to *every*
turn (an extra model call or an index round-trip) to serve a case the current
scenarios do not exhibit. Adding them speculatively trades a real cost for a
hypothetical benefit. Revisit against measured session shape, not intuition.

## 4. Measured results

Local mock path exercises the full HTTP → NDJSON → validation → limiter pipeline
with **zero model spend** (the keyless mock stands in behind the same wire
protocol). The harness is proven working — runs below were executed 2026-07-10 evening (Next.js production build, keyless mock unless marked). Model-
representative latency requires the real gateway; those cells are filled from
controlled runs, not the mock (the mock streams on a fixed 15ms/word delay and
does not represent model TTFB).

| Run | Concurrency | Duration | TTFB p50 | TTFB p95 | Total p50 | Total p95 | 200 | 429 | 5xx | Malformed | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Local mock, short (caps raised) | 25 | 30s | 4ms | 9ms | 723ms | 734ms | 1050 | 0 | 0 | 0 | PASS |
| Local mock, long — near char budget (caps raised) | 25 | 30s | 4ms | 12ms | 958ms | 965ms | 800 | 0 | 0 | 0 | PASS |
| Local mock, high concurrency (caps raised) | 100 | 30s | 3ms | 8ms | 717ms | 729ms | 4200 | 0 | 0 | 0 | PASS |
| Local mock, DEFAULT caps — limiter correctness | 10 | 20s | 31ms | 41ms | 754ms | 763ms | 10 | 10 | 0 | 0 | PASS |
| Controlled live-prod burst, real model (within daily budget) | 3 | 15s | 1218ms | 2213ms | 3022ms | 4317ms | 12 | 3 | 0 | 0 | PASS |
| Live prod, real browser, 5 CONCURRENT sessions (2026-07-11) | 5 | 4 rounds | 972ms | 1653ms | 2549ms | 3900ms | 20 | 0 | 0 | 0 | PASS |
| Live prod, real browser, 40-exchange endurance session (2026-07-11) | 1 | ~11 min | 948ms | 1856ms | 3208ms | 4421ms | 40 | 0 | 0 | 0 | PASS |

**Live browser evidence (2026-07-11):** the two bottom rows were driven through
real Chrome against prod — five sessions streaming simultaneously, and one
40-exchange session whose median TTFB for turns 21–40 (934ms) matched turns
1–20 (956ms): latency is flat with session depth, the O(1) window working
live. Boundary probes fired during the concurrent run all held, and every
stored conversation audited back byte-for-byte from Supabase. Full report:
docs/benchmarks/2026-07-11-live-browser-sessions.md.

**Session endurance:** a 50-exchange conversation driven through the real route
holds green — every turn returns HTTP 200 with a terminal `done` event, no
degradation and no mid-session rejection, including with 1500-char user turns
where the char budget (not the turn count) is the binding constraint. Pinned by
`src/app/api/__tests__/chat.session.test.ts` (S1/S2) and the
`toPayloadMessages` invariant tests; verified via `npm run test`.

**How to read the buckets:** 429s are correct behavior under load, not failures
(the tool honors `Retry-After`), so they are their own column. The tool exits
non-zero on any 5xx, non-429 4xx, transport failure, streamed terminal
`error` event, or malformed/incomplete NDJSON stream — only 429s are exempt.

**Reading the numbers above (with their limits stated):**
- Mock-path *total* times are dominated by the mock's deliberate 15ms/word
  pacing, not the pipeline — the pipeline's own overhead is the TTFB column
  (p95 ≤ 12ms on the raised-cap runs; the default-caps run's 41ms p95 covers
  only 20 requests, most of which did limiter work).
- Throughput scaled linearly with concurrency (34.6 → 69.8 → 139.2 req/s at
  25 → 50 → 100) on a single local process with zero errors across 6,650
  streamed requests. (The 50-concurrency point comes from an additional 20s
  run: 1,400 requests, 0 errors, TTFB p95 12ms.) This measures one machine's
  mock pipeline, not production's multi-instance behavior — it bounds our
  code's overhead, not Vercel's platform.
- The default-caps run shows the limiter under a single-IP burst: exactly
  the per-IP budget served, everything else answered 429 with `Retry-After`,
  zero 5xx.
- The live-prod burst's TTFB p50 of 1,218ms sits ~200ms above the
  benchmark's 977–1,100ms model first-token medians, consistent with network
  + platform overhead in the low hundreds of ms. The 3 prod 429s came from a
  single-IP burst of 15 requests in a minute against a 10/min per-IP cap —
  the arithmetic matches the per-IP limiter, though the harness does not
  distinguish scopes.
- Exact reproduction commands: server
  `OPENROUTER_API_KEY= SUPABASE_URL= SUPABASE_SECRET_KEY=
  CONVERSATION_SIGNING_SECRET=<any> [RATE_LIMIT_PER_IP_PER_MINUTE=1000000
  RATE_LIMIT_GLOBAL_PER_DAY=10000000] npx next start -p 3005` (bracketed
  overrides for the raised-cap rows only); tool
  `node scripts/loadtest.mjs --url http://localhost:3005 --concurrency <N>
  --duration <s> --scenario short|long`.

## 5. What we would do at 10× / 100×

Concrete, in order:

- **Provision Upstash and raise the caps** (§2a, §2b) — the single highest-
  leverage step: durable shared counters plus a funded key and a higher
  `RATE_LIMIT_GLOBAL_PER_DAY`. This is the first thing to do and it is
  configuration, not code.
- **Add provider-level concurrency queueing** (§2c) — fallback routing is
  already there; beyond it, add a second provider/key for the model class and a
  short queue so bursts smooth out instead of erroring.
- **Regional read-replica for conversation reads** — only relevant *if* a
  read-heavy surface ever exists (e.g. an internal dashboard over stored
  conversations). The chat path itself does not read conversations on the hot
  path, so this is contingent, not immediate.
- **CDN-edge caching does NOT apply.** Every response is personalized to the
  visitor's turn and streamed; there is no cacheable shared body. Say so plainly
  rather than listing it as a lever — the win at the edge here is TLS/termination
  proximity, not response caching.
