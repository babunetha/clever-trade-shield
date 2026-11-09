import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Clever Trade Shield" },
      { name: "description", content: "Choose a new password for your Clever Trade Shield account." },
      { property: "og:title", content: "Reset Password — Clever Trade Shield" },
      { property: "og:description", content: "Securely set a new terminal password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(updateError.message);
    toast.success("Password updated");
    await router.invalidate();
    await router.navigate({ to: "/" });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="panel w-full max-w-md p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <KeyRound className="size-5" />
          </span>
          <h1 className="text-lg font-semibold">Set a new password</h1>
        </div>
        {!ready ? (
          <p className="mt-5 rounded-md border border-border bg-muted/40 p-3 text-xs">
            Open this page from the reset link in your email. If the link expired, go back to sign in
            and request a new one.{" "}
            <a className="text-primary underline" href="/login">
              Back to sign in
            </a>
          </p>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <Input
              type="password"
              placeholder="New password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={256}
              required
            />
            <Input
              type="password"
              placeholder="Repeat new password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              maxLength={256}
              required
            />
            {error ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
