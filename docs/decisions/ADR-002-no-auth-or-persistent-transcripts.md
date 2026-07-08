# ADR-002: No Authentication or Persistent Transcripts in the MVP

- Status: Accepted
- Date: 2026-07-08

## Context

The brief asks for a public customer-support chatbot. It includes a question
about portal access but does not ask the chatbot to become the client portal.
No required scenario needs identity, a user profile, or past chats.

## Decision

Do not implement authentication, user profiles, or persistent conversation
history. Keep the active conversation in the browser session and send a bounded
window to the server.

## Alternatives considered

1. Supabase Auth and a protected portal mock: visually broad, but invents product
   scope and consumes build time.
2. Anonymous persistent conversations: useful for analytics, but creates privacy
   and retention obligations without helping the user.
3. Session-only public chat: directly serves the brief with the least risk.

## Consequences

- Less implementation and privacy complexity
- No cross-device or returning-user history
- Portal/account questions must redirect to verified Cadre support

## Revisit when

The chatbot receives client-specific data, must access the real Cadre portal, or
needs account-aware support.
