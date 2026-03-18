-- Run this in Supabase: SQL Editor → New query → paste → Run
-- Creates tables for the Misar queue (persisted in Supabase).

-- Queue entries (customers waiting)
create table if not exists public.queue (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null,
  misars int not null default 1 check (misars >= 1 and misars <= 10),
  joined_at bigint not null
);

-- Single row: when the current front customer started being served (for wait math) + queue open/closed
create table if not exists public.queue_meta (
  id int primary key default 1 check (id = 1),
  current_started_at bigint,
  queue_open boolean not null default true
);

insert into public.queue_meta (id, current_started_at, queue_open) values (1, null, true)
on conflict (id) do nothing;

-- Permanent log of every customer who joins (for future use; never deleted when they leave the queue)
create table if not exists public.queue_joins (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null,
  misars int not null,
  joined_at bigint not null,
  queue_ticket_id bigint
);

-- Deduped customer directory (unique by phone)
create table if not exists public.queue_customers (
  id bigint generated always as identity primary key,
  phone text not null unique,
  name text not null,
  first_seen_at bigint not null,
  last_seen_at bigint not null,
  join_count int not null default 1
);

-- Service metrics for completed tickets (actual time taken and per-misar rate)
create table if not exists public.queue_service_metrics (
  id bigint generated always as identity primary key,
  queue_ticket_id bigint,
  name text not null,
  phone text not null,
  misars int not null,
  started_at bigint not null,
  ended_at bigint not null,
  actual_minutes numeric not null,
  expected_minutes numeric not null,
  minutes_per_misar numeric not null
);

-- Allow backend (anon or service_role) to read/write. If using anon key, disable RLS.
alter table public.queue enable row level security;
alter table public.queue_meta enable row level security;

-- Policy: allow all for service_role and for anon (server-only use; do not expose anon from browser).
create policy "Allow all for queue" on public.queue for all using (true) with check (true);
create policy "Allow all for queue_meta" on public.queue_meta for all using (true) with check (true);
alter table public.queue_joins enable row level security;
create policy "Allow all for queue_joins" on public.queue_joins for all using (true) with check (true);

alter table public.queue_customers enable row level security;
alter table public.queue_service_metrics enable row level security;
create policy "Allow all for queue_customers" on public.queue_customers for all using (true) with check (true);
create policy "Allow all for queue_service_metrics" on public.queue_service_metrics for all using (true) with check (true);
