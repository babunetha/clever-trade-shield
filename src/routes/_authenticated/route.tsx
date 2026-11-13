import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getAccessStatus } from "@/lib/auth.functions";
import { boundedLoad } from "@/lib/load-recovery";
import { TradingProvider } from "@/lib/trading/store";
import { LoadingScreen, RouteRecovery } from "@/components/LoadRecovery";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Fast local check: with no stored session, go straight to sign-in without network waits.
    const local = await boundedLoad(supabase.auth.getSession(), 1500).catch(() => null);
    if (local && !local.data.session) throw redirect({ to: "/login" });
    const userResult = await boundedLoad(supabase.auth.getUser(), 8000);
    if (userResult.error && userResult.error.name !== "AuthSessionMissingError")
      throw new Error("Sign-in could not be checked.");
    if (!userResult?.data.user) throw redirect({ to: "/login" });
    const access = await boundedLoad(getAccessStatus(), 8000);
    if (!access?.owner) throw redirect({ to: "/login", search: { denied: "1" } });
  },
  component: () => (
    <TradingProvider>
      <Outlet />
    </TradingProvider>
  ),
  pendingComponent: LoadingScreen,
  errorComponent: RouteRecovery,
});
