# Fallback failure-injection test — 2026-07-11

Question under test: **what actually happens when the primary model fails?**
The gateway configures OpenRouter-native fallback routing
(`models: [primary, fallback]`, ADR-007 policy: fallback = benchmark
runner-up) and unit tests pin the request-body shape — but the fallback path
had never been exercised against the live provider. Three injections, sent
with the gateway's exact body shape (same headers, `stream: true`,
`max_tokens`, `temperature`), personal key, ~$0.07 total.

## Results

| # | Injection | Result |
|---|---|---|
| 1 | Invalid primary model ID, **no** fallback (control) | HTTP 400 `not a valid model ID` — hard fail, as expected |
| 2 | Invalid primary model ID **with** fallback array | HTTP 400 — **fallback did NOT engage.** OpenRouter validates every ID in `models` up front; an invalid ID rejects the whole request |
| 3 | **Valid** primary that fails at runtime (8k-context `google/gemma-2-9b-it` fed a ~20k-token prompt) with `claude-sonnet-4.5` fallback | Stream served by `anthropic/claude-4.5-sonnet-20250929` — OpenRouter's canonical serving ID for the configured fallback — via provider **Amazon Bedrock**. Fallback engaged, reply completed |

## What this establishes

1. **The outage class is covered.** When a valid primary errors at runtime
   (provider down, rate-limited, context overflow), OpenRouter serves the
   request from the configured fallback within the same HTTP call — no
   client-visible failure. Proven live (test 3), not just documented.
2. **The config-error class is NOT covered by the fallback.** A typo in
   `OPENROUTER_MODEL` 400s every request regardless of the fallback array.
   In this stack that becomes a `GatewayError` → the typed user-safe
   "temporary problem" event — a loud, honest outage rather than silent
   degradation. Guard: the post-deploy smoke test (a real chat turn) catches
   a bad model ID immediately; model IDs change only via ADR-007's benchmark
   rule, never casually.
3. **Provider-level redundancy exists below the model fallback.** Test 3 was
   served by Amazon Bedrock: OpenRouter routes a single Anthropic model
   across multiple upstream providers (Anthropic, Bedrock, Vertex), so an
   Anthropic-API outage does not by itself require the model fallback.

## Residual single points, honestly

- **The OpenRouter key** — one key, no automatic rotation. Key death (credit
  exhausted, revoked) fails every turn to the typed error with verified
  contact routing; `/api/health` and the smoke test surface it. Mitigation is
  operational (swap the env var, redeploy — a config change), by design for
  this scope.
- **OpenRouter itself** — the single gateway. A full OpenRouter outage is the
  one failure the fallback cannot route around; the floor is the same typed
  error + contact path. Adding a direct-provider second gateway is a
  `lib/gateway/` config-shaped change (SCALING §2c), deliberately out of
  scope for the take-home.

Failure ladder as deployed: primary (Haiku, multi-provider) → fallback model
(Sonnet, same call) → 45s provider timeout / mid-stream error detection →
typed user-safe error with verified contacts → rate limiter and prepaid key
credit as the spend backstops.

Method preserved in session records (`fallback-injection-test*.mjs`).
