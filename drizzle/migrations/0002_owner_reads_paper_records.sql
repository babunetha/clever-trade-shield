grant select on public.paper_trades to authenticated;
grant select on public.trade_audit to authenticated;
create policy "Owner reads paper trades" on public.paper_trades for select to authenticated using (public.has_role(auth.uid(), 'owner'));
create policy "Owner reads audit log" on public.trade_audit for select to authenticated using (public.has_role(auth.uid(), 'owner'));