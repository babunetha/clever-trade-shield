CREATE TABLE public.market_research_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL DEFAULT '{}'::jsonb);
GRANT SELECT ON public.market_research_runs TO authenticated;
GRANT ALL ON public.market_research_runs TO service_role;
ALTER TABLE public.market_research_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own research runs" ON public.market_research_runs FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'owner'));
CREATE INDEX market_research_runs_owner_time ON public.market_research_runs(user_id, created_at DESC);