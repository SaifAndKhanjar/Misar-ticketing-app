-- Run this in Supabase SQL Editor if you already have the base schema.
-- Adds: queue open/closed flag + permanent log of every customer who joins.

-- Add queue open/closed to meta (default true = open)
alter table public.queue_meta
  add column if not exists queue_open boolean not null default true;

-- Backfill: ensure the single row has queue_open
update public.queue_meta set queue_open = true where id = 1 and queue_open is null;

-- Permanent log of every join (for future use; never deleted when they leave the queue)
create table if not exists public.queue_joins (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null,
  misars int not null,
  joined_at bigint not null,
  queue_ticket_id bigint
);

alter table public.queue_joins enable row level security;
create policy "Allow all for queue_joins" on public.queue_joins for all using (true) with check (true);
