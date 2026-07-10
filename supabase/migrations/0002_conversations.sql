-- Conversations + messages: default-on transcript storage with private mode
-- (ADR-008, superseding the "no persistent transcripts" half of ADR-002).
--
-- Server-only, same posture as escalations: every write goes through a route
-- using the Supabase secret key, which bypasses row level security. RLS is
-- enabled with NO policies on both tables, so anon/authenticated roles have no
-- read or write path — the browser never touches these tables. Conversation
-- ids are HMAC-signed server-side (src/lib/conversations/token.ts) so a client
-- cannot forge an id to probe or pollute another conversation.

-- A conversation groups the turns of one browser session. The id is supplied by
-- the server (a signed UUID), never generated here, so the row it upserts and
-- the token it hands the client always agree — hence no default on `id`.
create table if not exists conversations (
  id uuid primary key,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

-- One stored chat turn is two rows (user + assistant). CHECK constraints mirror
-- the store's caps as defense in depth: the role is closed, and content is
-- bounded 1..4000 so a regression cannot persist empty or oversized text.
-- UNIQUE (conversation_id, turn_id, role) makes a client retry with the same
-- per-send turn_id dedup on insert instead of duplicating the turn.
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  turn_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  unique (conversation_id, turn_id, role)
);

-- Indexes on the read/delete paths: messages fetched in order per conversation,
-- and conversations swept by age for retention.
create index if not exists messages_conversation_created_idx
  on messages (conversation_id, created_at);
create index if not exists conversations_last_message_at_idx
  on conversations (last_message_at);

-- Escalation linking (ADR-008 #5): a consented lead may point at the
-- conversation that produced it. ON DELETE SET NULL so deleting a conversation
-- (retention or "Delete this chat") never removes the lead, only unlinks it. A
-- private-mode escalation is stored with conversation_id null.
alter table escalations
  add column if not exists conversation_id uuid references conversations(id) on delete set null;
create index if not exists escalations_conversation_id_idx
  on escalations (conversation_id);

-- No public access path: RLS on, and deliberately no policies. The service key
-- used by the server routes bypasses RLS; anon/authenticated roles get nothing.
alter table conversations enable row level security;
alter table messages enable row level security;

-- Enforced 30-day retention (ADR-008 #3). This replaces the previous
-- comment-only "30-day retention" claim on escalations (0001) with a real
-- mechanism: a table comment is not retention. pg_cron deletes aged rows daily;
-- messages cascade with their conversation, escalations are swept by age.
create extension if not exists pg_cron;

-- Unschedule-first makes re-applying this migration idempotent: cron.schedule
-- with an existing job name would otherwise create a duplicate job.
do $do$
begin
  perform cron.unschedule(jobid) from cron.job
    where jobname in ('delete-old-conversations', 'delete-old-escalations');
  perform cron.schedule(
    'delete-old-conversations',
    '0 9 * * *',
    $$delete from conversations where last_message_at < now() - interval '30 days'$$
  );
  perform cron.schedule(
    'delete-old-escalations',
    '0 9 * * *',
    $$delete from escalations where created_at < now() - interval '30 days'$$
  );
end
$do$;

comment on table conversations is
  'ADR-008 chat session; server-minted signed id. 30-day retention via pg_cron.';
comment on column conversations.last_message_at is
  'Bumped on each stored turn; drives the retention sweep.';
comment on table messages is
  'ADR-008 stored chat turns (user/assistant), content-capped, dedup by (conversation_id, turn_id, role). Cascades on conversation delete.';
comment on column escalations.conversation_id is
  'ADR-008 optional link to the originating conversation; null in private mode. SET NULL on conversation delete.';
