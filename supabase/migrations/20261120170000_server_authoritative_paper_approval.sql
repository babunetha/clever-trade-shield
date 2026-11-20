-- Server-authoritative, atomic paper-trade approvals.
-- Live broker execution is unrelated and remains hard-disabled.
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

alter table public.paper_trades add column if not exists approval_id text;
create unique index if not exists paper_trades_approval_id_uidx
  on public.paper_trades(approval_id) where approval_id is not null;

create or replace function public.approve_paper_trade(
  p_approval_id text,
  p_source text,
  p_source_timestamp timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_today_start timestamptz;
  v_week_start timestamptz;
  v_entry numeric;
  v_stop numeric;
  v_target numeric;
  v_quantity integer;
  v_risk numeric;
  v_rr numeric;
  v_side text;
  v_open_count integer;
  v_today_count integer;
  v_open_risk numeric;
  v_open_exposure numeric;
  v_daily_pnl numeric;
  v_weekly_pnl numeric;
  v_new_id text;
  v_minutes integer;
begin
  perform pg_advisory_xact_lock(hashtext('cts_atomic_paper_trade_approval'));

  if coalesce(trim(p_approval_id), '') = '' or length(p_approval_id) > 120 then
    return jsonb_build_object('ok', false, 'reason', 'Invalid or missing approval identifier.');
  end if;
  if p_source not in ('DHAN_LIVE','SIMULATED') then
    return jsonb_build_object('ok', false, 'reason', 'Unknown paper-trade data source.');
  end if;
  if p_source = 'DHAN_LIVE' and (
    p_source_timestamp is null
    or p_source_timestamp > v_now
    or v_now - p_source_timestamp > interval '20 seconds'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'Dhan source quote is missing or stale.');
  end if;
  if exists (select 1 from public.paper_trades where approval_id = p_approval_id) then
    return jsonb_build_object('ok', false, 'reason', 'This paper approval has already been recorded.');
  end if;

  v_entry := nullif(p_payload->>'entry','')::numeric;
  v_stop := nullif(p_payload->>'stopLoss','')::numeric;
  v_target := nullif(p_payload->>'target1','')::numeric;
  v_quantity := nullif(p_payload->>'quantity','')::integer;
  v_side := coalesce(p_payload->>'side','LONG');

  if v_entry is null or v_stop is null or v_target is null or v_quantity is null
    or v_entry <= 0 or v_stop <= 0 or v_target <= 0 or v_quantity <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'Invalid entry, stop, target or quantity.');
  end if;
  if v_side = 'LONG' then
    if v_stop >= v_entry or v_target <= v_entry then
      return jsonb_build_object('ok', false, 'reason', 'Invalid LONG stop or target placement.');
    end if;
    v_rr := (v_target - v_entry) / (v_entry - v_stop);
  elsif v_side = 'SHORT' then
    if v_stop <= v_entry or v_target >= v_entry then
      return jsonb_build_object('ok', false, 'reason', 'Invalid SHORT stop or target placement.');
    end if;
    v_rr := (v_entry - v_target) / (v_stop - v_entry);
  else
    return jsonb_build_object('ok', false, 'reason', 'Unsupported paper-trade side.');
  end if;
  v_risk := abs(v_entry - v_stop) * v_quantity;
  if v_risk <= 0 or v_risk > 500 then
    return jsonb_build_object('ok', false, 'reason', 'Per-trade risk exceeds the ₹500 server cap.');
  end if;
  if v_rr < 1.5 then
    return jsonb_build_object('ok', false, 'reason', 'Server-calculated reward/risk is below 1.5R.');
  end if;
  if v_entry * v_quantity > 100000 then
    return jsonb_build_object('ok', false, 'reason', 'Position value exceeds the ₹100,000 paper capital cap.');
  end if;

  v_today_start := date_trunc('day', v_now at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_week_start := (date_trunc('day', v_now at time zone 'Asia/Kolkata') - interval '6 days') at time zone 'Asia/Kolkata';
  v_minutes := extract(hour from v_now at time zone 'Asia/Kolkata')::integer * 60
    + extract(minute from v_now at time zone 'Asia/Kolkata')::integer;
  if v_minutes < 560 or v_minutes > 910 then
    return jsonb_build_object('ok', false, 'reason', 'Paper approvals are limited to the configured NSE session (09:20–15:10 IST).');
  end if;

  select count(*) into v_open_count from public.paper_trades where status = 'OPEN';
  select count(*) into v_today_count from public.paper_trades where opened_at >= v_today_start;
  select coalesce(sum(
    abs((payload->>'entry')::numeric - (payload->>'stopLoss')::numeric)
    * (payload->>'quantity')::numeric
  ), 0) into v_open_risk
  from public.paper_trades
  where status = 'OPEN'
    and payload ? 'entry' and payload ? 'stopLoss' and payload ? 'quantity';
  select coalesce(sum((payload->>'entry')::numeric * (payload->>'quantity')::numeric), 0)
    into v_open_exposure
  from public.paper_trades
  where status = 'OPEN' and payload ? 'entry' and payload ? 'quantity';
  select coalesce(sum(coalesce((payload->>'pnl')::numeric, 0)), 0)
    into v_daily_pnl
  from public.paper_trades
  where status = 'CLOSED' and closed_at >= v_today_start;
  select coalesce(sum(coalesce((payload->>'pnl')::numeric, 0)), 0)
    into v_weekly_pnl
  from public.paper_trades
  where status = 'CLOSED' and closed_at >= v_week_start;

  if v_open_count >= 2 then
    return jsonb_build_object('ok', false, 'reason', 'Maximum 2 open paper positions reached.');
  end if;
  if v_today_count >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'Maximum 3 paper entries for the NSE day reached.');
  end if;
  if v_weekly_pnl <= -2500 then
    return jsonb_build_object('ok', false, 'reason', 'Rolling 7-day paper loss limit of ₹2,500 reached.');
  end if;
  if greatest(0, -v_daily_pnl) + v_open_risk + v_risk > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'Daily loss and reserved open risk would exceed ₹1,000.');
  end if;
  if v_open_exposure + v_entry * v_quantity > 100000 then
    return jsonb_build_object('ok', false, 'reason', 'Combined open paper exposure exceeds ₹100,000.');
  end if;

  v_new_id := coalesce(nullif(p_payload->>'id',''), 'TRD-' || gen_random_uuid()::text);
  insert into public.paper_trades(id, approval_id, symbol, status, opened_at, payload)
  values (
    v_new_id,
    p_approval_id,
    upper(p_payload->>'symbol'),
    'OPEN',
    v_now,
    p_payload || jsonb_build_object(
      'id', v_new_id,
      'openedAt', v_now,
      'status', 'OPEN',
      'riskRupees', v_risk,
      'riskReward', round(v_rr::numeric, 4),
      'dataSource', p_source,
      'sourceTimestamp', p_source_timestamp
    )
  );

  return jsonb_build_object(
    'ok', true,
    'trade', p_payload || jsonb_build_object(
      'id', v_new_id,
      'openedAt', v_now,
      'status', 'OPEN',
      'riskRupees', v_risk,
      'riskReward', round(v_rr::numeric, 4),
      'dataSource', p_source,
      'sourceTimestamp', p_source_timestamp
    )
  );
end;
$$;

revoke all on function public.approve_paper_trade(text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.approve_paper_trade(text,text,timestamptz,jsonb) to service_role;
