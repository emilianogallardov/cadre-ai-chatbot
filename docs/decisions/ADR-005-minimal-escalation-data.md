# ADR-005: Minimize and Isolate Escalation Data

- Status: Accepted (2026-07-08, see ADR addendum below)
- Date: 2026-07-08

## Context

A persisted escalation makes the unknown-answer path credible, but it introduces
PII, spam, deletion, and access-control requirements.

## Proposed decision

If persistence is included, store only name, email, optional company, question,
consent timestamp, status, and a generated reference ID. Insert through a
validated server route using server-only credentials. Do not expose public reads
or save the surrounding transcript.

## Alternatives considered

1. Contact link only: safest and sufficient, but less demonstrative.
2. Email directly from the app: creates deliverability and abuse concerns.
3. Minimal Supabase ticket: tangible workflow with a clear schema and security
   story.

## Consequences

- Requires a retention period, spam controls, and database configuration
- Demonstrates a real side effect without storing all conversations
- Needs a reliable direct-contact fallback if persistence fails

## Acceptance condition

Accept this ADR only after choosing the retention period and confirming whether
the take-home should create real records or use an obvious demo mode.

## Acceptance addendum (2026-07-08)

Accepted with real Supabase persistence, per user decision (timeline T-022):

- Real rows in a single server-only `escalations` table using the minimal schema
  in `docs/architecture/data-and-storage.md`.
- Retention period: 30 days. Records created during the take-home window are
  demo-quality leads; the retention note ships in the README and the consent copy.
- Inserts happen only through the validated server tool route; the browser never
  receives Supabase credentials; no public read policy.
- If the insert fails, the user always receives the verified direct-contact
  fallback (contact page, email, phone).
- Spam control: the same Upstash limiter (ADR-006) plus per-session escalation cap.
