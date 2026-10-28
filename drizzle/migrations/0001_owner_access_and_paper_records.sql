grant all on public.order_intents, public.broker_orders, public.broker_trades, public.broker_postbacks, public.risk_events to service_role;

create table if not exists public.paper_trades (
  id text primary key,
  symbol text not null,
  status text not null check (status in ('OPEN','CLOSED')),
  opened_at timestamptz not null,
  closed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists paper_trades_opened_idx on public.paper_trades(opened_at desc);
grant all on public.paper_trades to service_role;
alter table public.paper_trades enable row level security;

create table if not exists public.trade_audit (
  id text primary key,
  at timestamptz not null,
  action text not null,
  severity text not null check (severity in ('INFO','WARN','CRITICAL')),
  detail text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trade_audit_at_idx on public.trade_audit(at desc);
grant all on public.trade_audit to service_role;
alter table public.trade_audit enable row level security;

create type public.app_role as enum ('owner');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users can read their own roles"
on public.user_roles for select to authenticated
using (auth.uid() = user_id);

-- The very first account to sign up becomes the single terminal owner; later sign-ups get no access.
create or replace function public.assign_first_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('cts_first_owner'));
  if not exists (select 1 from public.user_roles where role = 'owner') then
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_assign_owner
after insert on auth.users
for each row execute function public.assign_first_owner();
