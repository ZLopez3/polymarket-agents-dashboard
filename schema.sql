-- Strategies table
create table if not exists public.strategies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'pending',
  owner text,
  bankroll_pct numeric,
  paper_capital numeric default 1000,
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

-- Trades table
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid references public.strategies(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  market text,
  side text,
  notional numeric,
  pnl numeric,
  executed_at timestamptz default now()
);

-- Events table
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete set null,
  event_type text,
  severity text,
  message text,
  created_at timestamptz default now()
);

-- Agent heartbeats table
create table if not exists public.agent_heartbeats (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete cascade,
  status text,
  detail text,
  created_at timestamptz default now()
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

-- Enable read access for anon key (RLS must be enabled in Supabase UI)
-- Apply these as policies in Supabase (Policies tab) or run as SQL if you manage policies via SQL.
-- Example policy: CREATE POLICY "public_read" ON public.strategies FOR SELECT USING (true);

-- Strategy settings table
create table if not exists public.strategy_settings (
  strategy_id uuid primary key references public.strategies(id) on delete cascade,
  max_trade_notional numeric default 200,
  max_trades_per_hour integer default 30,
  max_daily_notional numeric default 2000,
  max_daily_loss numeric default -100,
  divergence_threshold numeric default 20,
  certainty_threshold numeric default 0.95,
  liquidity_floor numeric default 0.5,
  order_size_multiplier numeric default 1.0,
  last_tuned_at timestamptz
);
