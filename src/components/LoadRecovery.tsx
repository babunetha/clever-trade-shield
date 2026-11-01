import { useEffect, useState } from "react";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { AlertTriangle, LoaderCircle, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  boundedLoad,
  RECOVERY_TIMEOUT_MS,
  SIGN_IN_TIMEOUT_MS,
  signInLabels,
  type SignInStatus,
} from "@/lib/load-recovery";

export function LoadRecovery({
  loading = false,
  onRetry,
}: {
  loading?: boolean;
  onRetry?: () => Promise<void>;
}) {
  const [status, setStatus] = useState<SignInStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let active = true;
    void boundedLoad(supabase.auth.getUser(), SIGN_IN_TIMEOUT_MS)
      .then((result) => {
        if (!active) return;
        setStatus(
          result.data.user
            ? "signed-in"
            : result.error && result.error.name !== "AuthSessionMissingError"
              ? "unavailable"
              : "signed-out",
        );
      })
      .catch(() => {
        if (active) setStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), RECOVERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  async function retry() {
    setBusy(true);
    try {
      if (onRetry) await boundedLoad(onRetry(), RECOVERY_TIMEOUT_MS);
      else window.location.reload();
    } catch {
      setSlow(true);
    } finally {
      setBusy(false);
    }
  }
  const waiting = loading && !slow;
  return (
    <main className="grid min-h-svh place-items-center bg-background px-5 py-10">
      <section className="w-full max-w-md space-y-6" aria-label="App recovery">
        <div className="flex items-center gap-3 text-primary">
          <ShieldCheck className="size-7 shrink-0" />
          <span className="text-lg font-semibold">Clever Trade Shield</span>
        </div>
        <div role={waiting ? "status" : "alert"} className="space-y-3">
          {waiting ? (
            <LoaderCircle className="size-8 text-primary motion-safe:animate-spin" />
          ) : (
            <AlertTriangle className="size-8 text-warn" />
          )}
          <h1 className="text-2xl font-semibold">
            {waiting ? "Opening your terminal…" : "Your terminal couldn’t load"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {waiting
              ? "Waiting for a secure connection."
              : "The connection may be interrupted. Retry this page or open sign-in. Live orders remain disabled."}
          </p>
        </div>
        <div className="border-y border-border py-4 text-sm" aria-live="polite">
          <p className="mb-1 text-xs text-muted-foreground">Sign-in status</p>
          <p>{signInLabels[status]}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void retry()} disabled={busy}>
            <RefreshCw className={busy ? "motion-safe:animate-spin" : ""} />
            {busy ? "Retrying…" : "Retry"}
          </Button>
          <Button asChild variant="outline">
            <a href="/login">
              <LogIn />
              Open sign-in
            </a>
          </Button>
        </div>
      </section>
    </main>
  );
}

export function RouteRecovery({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <LoadRecovery
      onRetry={async () => {
        await router.invalidate();
        reset();
      }}
    />
  );
}

export function LoadingScreen() {
  return <LoadRecovery loading />;
}
