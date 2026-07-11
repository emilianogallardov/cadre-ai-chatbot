# Spec: route-level tests for the three public routes

- Origin: Codex round-3 finding #12 (docs/reviews/2026-07-10-codex-round3-full-repo-review.md),
  un-deferred by the owner for pre-submission hardening.
- Goal: the verify gate exercises `/api/chat`, `/api/conversations`, and
  `/api/escalations` end to end — NDJSON protocol, event ordering, error
  paths, storage gating — with zero network and zero model spend.

## Hard constraints

1. **Test code only.** No product-code changes. If a genuine testability
   blocker exists, STOP and report it in the handoff instead of refactoring
   routes.
2. Tests live under `src/` (vitest include is `src/**/*.test.ts`):
   `src/app/api/__tests__/{chat,conversations,escalations}.route.test.ts`.
3. Import the handlers directly (`import { POST } from "../chat/route"`) and
   drive them with real `NextRequest` objects.
4. Mock at the existing lib seams with `vi.mock` + `importActual` partial
   mocks — keep real classes (`GatewayError`, `StoreError`, `ValidationError`)
   real so `instanceof` checks in routes keep working:
   - `@/lib/gateway/openrouter`: `isGatewayConfigured`, `streamChatCompletion`
     (async generator you control: yield deltas, or throw `GatewayError`
     mid-iteration).
   - `@/lib/limits/ratelimit`: `checkRateLimit`, `checkEscalationLimit`.
   - `@/lib/conversations/token` + `@/lib/conversations/store`, or stub env
     (`CONVERSATION_SIGNING_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`)
     with `vi.stubEnv` and mock only the PostgREST-touching store functions
     (`storeTurn`, `linkConversation`, `deleteConversation`).
   - `@/lib/escalations/store`: `getEscalationStore` returning a controllable
     fake.
   - `next/server`: partial-mock ONLY `after` (capture the callback and run it
     synchronously so post-response storage is assertable); everything else
     via `importActual`.
5. NDJSON responses: read `res.body` fully, split lines, `JSON.parse` each —
   assert on the typed event sequence.
6. Deterministic: no sleeps, no real timers needed (mock stream yields
   synchronously).

## Required cases

### /api/chat POST

- C1 happy path (gateway configured, storage configured, valid turnId):
  events are text… → `conversation` → `action`(s if selector fires) → `done`;
  `conversation` strictly BEFORE any `action`; `done` is last;
  content-type `application/x-ndjson`.
- C2 invalid body shape → HTTP 400, single `{type:"error",code:"invalid_request"}`.
- C3 body over 64KB → HTTP 413, `invalid_request`.
- C4 per-IP rate limited → HTTP 429 + `Retry-After` header + message
  containing the wait seconds; global scope → message naming daily capacity.
- C5 mid-stream `GatewayError` after one delta → stream contains the delta,
  then `{type:"error",code:"provider_error"}`; NO `action`, NO `done`, and the
  captured `after` callback list shows `storeTurn` was never scheduled.
- C6 `private: true` → no `conversation` event anywhere; `storeTurn` never
  called; stream still completes with `done`.
- C7 keyless (`isGatewayConfigured` false) + `VERCEL_ENV=production` →
  HTTP 503 `provider_error` naming verified contacts; keyless with
  `VERCEL_ENV` unset → mock stream runs and ends in `done`.

### /api/conversations DELETE

- V1 non-JSON content-type → 415.
- V2 malformed JSON → 400.
- V3 syntactically invalid / bad-signature token → 400 with the SAME message
  as V2-style invalid input (no verification oracle).
- V4 valid token → `deleteConversation` called with the embedded UUID,
  response `{ok:true}` 200.
- V5 store failure → 502 `{ok:false}`.

### /api/escalations POST

- E1 non-JSON content-type → 400.
- E2 body over 16KB → 413.
- E3 invalid fields (bad email) → 400 AND `checkEscalationLimit` NOT called
  (validation runs before the cap is consumed).
- E4 rate limited → 429-style typed result, no insert.
- E5 valid + verified conversationToken → `linkConversation` called BEFORE
  the store insert; insert receives `conversation_id` = token's UUID;
  response ok with `referenceId`.
- E6 valid + invalid conversationToken → insert receives
  `conversation_id: null`; still succeeds (token problems never block a lead).
- E7 store throws `StoreError` → response is the direct-contact fallback
  shape (ok:false with verified contact details), not a raw 500.

## Acceptance

- `npm run verify` green with the new files included (no config changes
  needed — the include pattern already covers them).
- Each case maps 1:1 to a `it()` whose name starts with its ID (e.g.
  `"C5: mid-stream provider error emits typed error and stores nothing"`).
- Handoff reports: case→test mapping, any spec case that proved untestable
  and why, full `npm run verify` tail.
