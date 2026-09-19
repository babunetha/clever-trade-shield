create extension if not exists pgcrypto;

create table if not exists public.order_intents (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  signal_id text not null,
  symbol text not null,
  exchange_segment text not null default 'NSE_EQ',
  transaction_type text not null check (transaction_type in ('BUY','SELL')),
  quantity integer not null check (quantity > 0),
  order_type text not null check (order_type in ('MARKET','LIMIT','SL','SL-M')),
  product_type text not null default 'INTRADAY' check (product_type = 'INTRADAY'),
  price numeric(18,6),
  trigger_price numeric(18,6),
  entry_price numeric(18,6) not null check (entry_price > 0),
  stop_loss numeric(18,6) not null check (stop_loss > 0),
  declared_risk numeric(18,6) not null check (declared_risk >= 0),
  status text not null default 'PENDING',
  broker_correlation_id text unique,
  broker_order_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_intents_signal_idx on public.order_intents(signal_id);
create index if not exists order_intents_status_idx on public.order_intents(status);
create index if not exists order_intents_created_idx on public.order_intents(created_at desc);

create table if not exists public.broker_orders (
  id uuid primary key default gen_random_uuid(),
  order_intent_id uuid references public.order_intents(id) on delete set null,
  broker_order_id text not null unique,
  correlation_id text,
  status text not null,
  transaction_type text,
  symbol text,
  quantity integer,
  filled_quantity integer not null default 0,
  average_price numeric(18,6),
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists broker_orders_intent_idx on public.broker_orders(order_intent_id);
create index if not exists broker_orders_correlation_idx on public.broker_orders(correlation_id);

create table if not exists public.broker_trades (
  id uuid primary key default gen_random_uuid(),
  broker_trade_id text not null unique,
  broker_order_id text,
  order_intent_id uuid references public.order_intents(id) on delete set null,
  symbol text not null,
  transaction_type text not null check (transaction_type in ('BUY','SELL')),
  quantity integer not null check (quantity > 0),
  price numeric(18,6) not null check (price > 0),
  trade_time timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists broker_trades_order_idx on public.broker_trades(broker_order_id);
create index if not exists broker_trades_intent_idx on public.broker_trades(order_intent_id);

create table if not exists public.broker_postbacks (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  broker_order_id text,
  correlation_id text,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists broker_postbacks_order_idx on public.broker_postbacks(broker_order_id);
create index if not exists broker_postbacks_received_idx on public.broker_postbacks(received_at desc);

create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null check (severity in ('INFO','WARN','BLOCK')),
  signal_id text,
  symbol text,
  idempotency_key text,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists risk_events_created_idx on public.risk_events(created_at desc);
create index if not exists risk_events_signal_idx on public.risk_events(signal_id);

alter table public.order_intents enable row level security;
alter table public.broker_orders enable row level security;
alter table public.broker_trades enable row level security;
alter table public.broker_postbacks enable row level security;
alter table public.risk_events enable row level security;

revoke all on public.order_intents, public.broker_orders, public.broker_trades, public.broker_postbacks, public.risk_events from anon, authenticated;

create policy "deny_anon" on public.order_intents as restrictive for all to anon using (false) with check (false);
create policy "deny_authenticated" on public.order_intents as restrictive for all to authenticated using (false) with check (false);
create policy "deny_anon" on public.broker_orders as restrictive for all to anon using (false) with check (false);
create policy "deny_authenticated" on public.broker_orders as restrictive for all to authenticated using (false) with check (false);
create policy "deny_anon" on public.broker_trades as restrictive for all to anon using (false) with check (false);
create policy "deny_authenticated" on public.broker_trades as restrictive for all to authenticated using (false) with check (false);
create policy "deny_anon" on public.broker_postbacks as restrictive for all to anon using (false) with check (false);
create policy "deny_authenticated" on public.broker_postbacks as restrictive for all to authenticated using (false) with check (false);
create policy "deny_anon" on public.risk_events as restrictive for all to anon using (false) with check (false);
create policy "deny_authenticated" on public.risk_events as restrictive for all to authenticated using (false) with check (false);
