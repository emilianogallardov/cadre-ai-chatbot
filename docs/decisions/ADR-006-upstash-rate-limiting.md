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

## Revisit when

The bot gets real production traffic (move limits behind auth/tenancy), or the
model budget stops being a fixed metered key.
