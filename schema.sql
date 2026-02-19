-- Strategies table
create table if not exists public.strategies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'pending',
  owner text,
  bankroll_pct numeric,
  updated_at timestamptz default now()
);

-- Agents table
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  strategy_id uuid references public.strategies(id) on delete cascade,
  status text not null default 'inactive',
  last_heartbeat timestamptz,
  config jsonb default '{}'::jsonb
);

-- Seed strategies
insert into public.strategies (name, status, owner, bankroll_pct)
values
  ('Polymarket Bond Ladder', 'planning', 'Ops Desk', 0.40),
  ('AI Contrarian', 'planning', 'Research Lead', 0.30)
on conflict (name) do nothing;

-- Seed agents linked to strategies
insert into public.agents (name, strategy_id, status)
select 'BondLadder-Agent', id, 'idle'
from public.strategies
where name = 'Polymarket Bond Ladder'
on conflict (name) do nothing;

insert into public.agents (name, strategy_id, status)
select 'AIContrarian-Agent', id, 'idle'
from public.strategies
where name = 'AI Contrarian'
on conflict (name) do nothing;
