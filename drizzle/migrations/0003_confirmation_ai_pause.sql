CREATE TABLE public.confirmation_ai_pause (
  user_id uuid PRIMARY KEY,
  status integer NOT NULL,
  message text NOT NULL,
  provider_denial boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.confirmation_ai_pause TO authenticated;
GRANT ALL ON public.confirmation_ai_pause TO service_role;
ALTER TABLE public.confirmation_ai_pause ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own confirmation AI pause" ON public.confirmation_ai_pause FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'owner'));