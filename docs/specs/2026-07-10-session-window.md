# Spec: client rolling window + session-endurance test

- Problem (owner-found, missed by five review rounds): the client sends the
  ENTIRE transcript every turn while the server rejects payloads over
  `LIMITS.maxTotalChars` (8000) / `maxMessages` (30) / `maxMessageChars`
  (2000 per message) — but the prompt assembler only uses the last 12 turns
  anyway. A normal session accumulates ~700 chars/exchange and dies with a
  validation error around turn 10–12, a mid-conversation dead end.
- Fix principle: the client sends only what the server will use — a rolling
  window that is valid BY CONSTRUCTION. Server caps stay unchanged as
  defense in depth.

## Part 1 — windowing in `src/lib/chat/payload.ts`

1. Single source of truth for the window size: add `promptWindowTurns: 12`
   to `LIMITS` in `src/lib/chat/types.ts` (a light module with no server-only
   imports). Update `src/lib/prompt/assemble.ts` so `MAX_PROMPT_TURNS`
   derives from `LIMITS.promptWindowTurns` (keep the exported name so its
   test/imports stay valid). Do NOT import from `assemble.ts` into
   `payload.ts` — payload code reaches the client bundle and must not pull
   the knowledge base with it.
2. `toPayloadMessages` pipeline becomes: clean/merge (existing behavior) →
   truncate any single message to `LIMITS.maxMessageChars` (assistant
   replies at 600 tokens can exceed 2000 chars, and same-role merges can
   too; truncation keeps history context without tripping the per-message
   cap) → window to the last `promptWindowTurns` messages → drop oldest
   while total chars exceed `LIMITS.maxTotalChars` → ensure the window
   still starts with a user turn (drop a leading assistant message if the
   slice landed on one; alternation is otherwise preserved by slicing an
   alternating list).
3. The result must satisfy `validateMessages` for every input the product
   can produce — `send()` always appends a non-empty USER message last, so
   the guaranteed domain is non-empty, user-ending transcripts (a valid
   alternating user-start/user-end payload has odd length, so real windows
   top out at `promptWindowTurns - 1` messages). That precondition-scoped
   invariant is what the tests pin. *(Clarified 2026-07-10 after Codex
   round-6 #2 — the original "ALWAYS" overclaimed: empty or assistant-final
   inputs are outside the product's call pattern and carry no guarantee.)*

## Part 2 — tests

`src/lib/chat/__tests__/payload.test.ts` (extend the existing file):
- P1: a 60-message alternating transcript windows to exactly
  `promptWindowTurns` messages, most-recent-last, starting with a user turn.
- P2: oversized single messages (2500-char assistant reply; merged
  consecutive user turns totalling >2000) are truncated to
  `maxMessageChars`.
- P3: a window whose 12 messages still exceed `maxTotalChars` drops oldest
  until it fits.
- P4 (the invariant): for a range of generated transcripts (long, chatty,
  retry-shaped with empties and same-role runs), `validateMessages(
  toPayloadMessages(t))` never throws.
- P5: `LIMITS.promptWindowTurns === MAX_PROMPT_TURNS` (the assembler and the
  client window can never drift apart silently).

`src/app/api/__tests__/chat.session.test.ts` (new — session endurance
through the real route):
- S1: drive a 50-exchange conversation through `POST /api/chat` on the mock
  path (gateway unconfigured, `VERCEL_ENV` unset, storage env stubbed like
  chat.route.test.ts): each turn appends the user message + the streamed
  assistant reply to a client-side transcript, sends
  `toPayloadMessages(transcript)`, and asserts HTTP 200 with a terminal
  `done` event — EVERY turn, no degradation, no rejection.
- S2: the same 50-exchange loop with long (1500-char) user messages — the
  char budget, not the turn count, is the binding constraint — still never
  rejects.
- Reuse the established route-test patterns from chat.route.test.ts:
  partial mocks via importOriginal, captured `after()`, fake timers with
  `runAllTimersAsync` for the mock stream's 15ms delays (see C7), real
  minted tokens via stubbed CONVERSATION_SIGNING_SECRET.

## Hard constraints

- Files: `src/lib/chat/types.ts`, `src/lib/chat/payload.ts`,
  `src/lib/prompt/assemble.ts` (window-constant derivation ONLY),
  `src/lib/chat/__tests__/payload.test.ts`,
  `src/app/api/__tests__/chat.session.test.ts`. Nothing else.
- No behavior change to server validation or assembly semantics.
- No network, no model spend. Do not commit; do not touch timeline/plan.
- `npm run verify` green; include its tail in the handoff.
