-- Adds:
-- 1) Deduped customer directory (unique by phone)
-- 2) Service metrics for completed tickets (actual time taken, per-misar rate)

create table if not exists public.queue_customers (
  id bigint generated always as identity primary key,
  phone text not null unique,
  name text not null,
  first_seen_at bigint not null,
  last_seen_at bigint not null,
  join_count int not null default 1
);

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

alter table public.queue_customers enable row level security;
alter table public.queue_service_metrics enable row level security;

create policy "Allow all for queue_customers" on public.queue_customers for all using (true) with check (true);
create policy "Allow all for queue_service_metrics" on public.queue_service_metrics for all using (true) with check (true);
