-- Escalations: minimal support-lead table (ADR-005).
--
-- Server-only. Inserts happen exclusively through the validated
-- POST /api/escalations route using the Supabase secret key, which bypasses
-- row level security. RLS is enabled with NO policies, so there is no public
-- (anon/authenticated) read or write path — the browser never touches this
-- table. See docs/architecture/data-and-storage.md.
--
-- ADR-005 minimal schema: the `company` column from the reference schema is
-- intentionally omitted. Only name, email, question, a server-recorded consent
-- timestamp, status, and a generated reference id are stored. The surrounding
-- transcript is never persisted.

create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  question text not null,
  consented_at timestamptz not null,
  status text not null default 'new'
);

-- No public access path: RLS on, and deliberately no policies. The service key
-- used by the server route bypasses RLS; anon/authenticated roles get nothing.
alter table escalations enable row level security;

-- Retention (ADR-005): records are demo-quality leads kept for 30 days, then
-- deleted. The scheduled deletion job (e.g. pg_cron / a Supabase scheduled
-- function running `delete from escalations where created_at < now() - interval
-- '30 days'`) is out of scope for the MVP and documented here and in the README
-- rather than implemented in this migration.
