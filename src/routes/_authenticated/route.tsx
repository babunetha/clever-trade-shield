import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getAccessStatus } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
    const access = await getAccessStatus().catch(() => null);
    if (!access?.owner) throw redirect({ to: "/login", search: { denied: "1" } });
  },
  component: () => <Outlet />,
});
