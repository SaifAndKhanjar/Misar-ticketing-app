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

-- Single row: when the current front customer started being served (for wait math)
create table if not exists public.queue_meta (
  id int primary key default 1 check (id = 1),
  current_started_at bigint
);

insert into public.queue_meta (id, current_started_at) values (1, null)
on conflict (id) do nothing;

-- Allow backend (anon or service_role) to read/write. If using anon key, disable RLS.
alter table public.queue enable row level security;
alter table public.queue_meta enable row level security;

-- Policy: allow all for service_role and for anon (server-only use; do not expose anon from browser).
create policy "Allow all for queue" on public.queue for all using (true) with check (true);
create policy "Allow all for queue_meta" on public.queue_meta for all using (true) with check (true);
