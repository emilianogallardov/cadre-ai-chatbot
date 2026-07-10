# ADR-006: Durable Public Rate Limiting via Upstash Redis

- Status: Accepted
- Date: 2026-07-08

## Context

The deployed chatbot is public and unauthenticated, and every chat turn spends a
metered OpenRouter key with a $5 budget that must survive until the live review.
Vercel serverless functions do not share memory between instances, so an
in-memory counter cannot guarantee a global spend ceiling.

## Decision

Use Upstash Redis with `@upstash/ratelimit` as the durable limiter, enforced in
the chat endpoint before any model call:

1. **Per-IP sliding window** — bounds any single client (normal users never hit it).
2. **Global daily request cap** — a shared counter that is the actual budget
   guarantee: once the day's cap is reached, the endpoint returns a friendly
   retry-later response with direct contact details and spends nothing.
3. **Request-shape caps** — bounded message count, message length, and
   `max_tokens`, so even allowed requests have a known worst-case cost.

Limits are configured via environment variables so they can be tuned without a
deploy. When the Redis env vars are absent (local dev), the limiter degrades to
a permissive in-memory fallback and logs a warning — production requires the
real limiter.

## Alternatives considered

1. In-memory per-instance limiter: zero dependencies, but per-instance counters
   make the global ceiling soft on serverless.
2. Vercel WAF/firewall rules: no code, but coarse, plan-dependent, and cannot
   express a global spend cap.
3. Upstash Redis: one free-tier dependency, durable shared counters, and the
   library is purpose-built for edge/serverless.

## Consequences

- One external service and two env vars (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
- The demo path must be verified against the limits so the reviewer is never
  blocked during normal use.
- Rate-limit responses are a designed UI state, not an error dump.

## Amendments (2026-07-09, after adversarial review)

An external adversarial review (Codex GPT-5.5) of the Phase 2 implementation
changed two details of this decision:

1. **Fail closed, not open.** The original implementation failed open on a
   Redis outage (availability over strictness). Review showed this suspends the
   budget guarantee exactly when it matters; since the limiter fronts a metered
   $5 key and the rate-limit response already includes verified contact
   details, an outage now denies with the same friendly 429 instead of
   spending unmetered.
2. **Whole-conversation character cap.** Per-message caps alone allowed a
   worst case of ~15k input tokens per request — at 400 requests/day that
   could exceed the budget. `LIMITS.maxTotalChars` (8000) now bounds the whole
   payload, making the worst-case day roughly $2 at Haiku-class pricing.
   With the Sonnet-class fallback (ADR-007) taking every worst-case request —
   the true worst case, at roughly 4× Haiku pricing — a full day still lands
   around $5–6, and the key's own prepaid credit limit is the hard backstop:
   OpenRouter stops serving when the metered credit is exhausted, so no
   configuration error here can overspend the key.

The same review round added structural transcript validation (strict
user/assistant alternation ending in a user turn), closing the forged
assistant-history injection channel at the shape level.

## Revisit when

The bot gets real production traffic (move limits behind auth/tenancy), or the
model budget stops being a fixed metered key.
