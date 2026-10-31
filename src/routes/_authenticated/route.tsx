import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getAccessStatus } from "@/lib/auth.functions";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function CheckingAccess() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <p className="font-mono text-sm tracking-wide">Checking access…</p>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  //PC
  beforeLoad: async () => {
    const userResult = await withTimeout(supabase.auth.getUser(), 8000);
    if (!userResult?.data.user) throw redirect({ to: "/login" });
    const access = await withTimeout(
      getAccessStatus().catch(() => null),
      8000,
    );
    if (!access?.owner) throw redirect({ to: "/login", search: { denied: "1" } });
  },
  component: () => <Outlet />,
});
