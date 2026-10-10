create table if not exists public.itineraries (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 plan jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.itineraries enable row level security;
create policy "Users own their itineraries" on public.itineraries
 for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
