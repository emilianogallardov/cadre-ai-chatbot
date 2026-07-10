# Architecture Decision Index

| ID | Decision | Status |
|---|---|---|
| ADR-001 | Curated static knowledge before RAG | Accepted |
| ADR-002 | No authentication or persistent transcripts in MVP | Auth half accepted; transcript half superseded by ADR-008 |
| ADR-003 | Voice as progressive enhancement | Accepted |
| ADR-004 | Structured tools for actions and side effects | Accepted |
| ADR-005 | Minimize and isolate escalation data (real Supabase rows, 30-day retention) | Accepted |
| ADR-006 | Durable public rate limiting via Upstash Redis | Accepted |
| ADR-007 | Model selection by scenario benchmark | Accepted; selected claude-haiku-4.5, fallback claude-sonnet-4.5 |
| ADR-008 | Conversation storage: notice at collection, private mode, delete control, pg_cron retention | Accepted |

Accepted decisions are the current default for implementation. Changing one
requires a new ADR or a dated addendum — not a silent code change.
