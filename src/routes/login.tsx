import { useState, type FormEvent } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { denied?: "1" } =>
    search.denied === "1" ? { denied: "1" } : {},
  head: () => ({
    meta: [
      { title: "Secure Login — Clever Trade Shield" },
      { name: "description", content: "Authenticated access to Clever Trade Shield." },
      { property: "og:title", content: "Secure Login — Clever Trade Shield" },
      {
        property: "og:description",
        content: "Private authenticated access to the risk-controlled trading terminal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const { denied } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (mode === "signup") {
        if (password.length < 8) {
          setError("Use at least 8 characters for the password.");
          return;
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
        if (!data.session) {
          setNotice("Check your email and click the confirmation link, then sign in here.");
          setMode("signin");
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
      }
      toast.success("Secure session established");
      await router.invalidate();
      await router.navigate({ to: "/" });
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="panel w-full max-w-md p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold">Clever Trade Shield</h1>
              <p className="text-xs text-muted-foreground">Private trading terminal</p>
            </div>
          </div>
          <Badge variant="outline">SECURE LOGIN</Badge>
        </div>
        <div className="mt-6 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          The first account created becomes the terminal owner. Any later account is refused
          access. Dhan credentials stay on the server and are never requested here.
        </div>
        {denied ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            This account is signed in but does not have terminal access.
          </p>
        ) : null}
        <form className="mt-5 space-y-4" onSubmit={submit}>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
                disabled={busy}
              />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Password</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={mode === "signup" ? 8 : undefined}
                maxLength={256}
                disabled={busy}
              />
            </div>
          </label>
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-xs">{notice}</p>
          ) : null}
          <Button className="w-full" type="submit" disabled={busy || !email || !password}>
            {busy ? "Please wait…" : mode === "signup" ? "Create owner account" : "Unlock terminal"}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
          }}
        >
          {mode === "signin" ? "First time here? Create the owner account" : "Already have an account? Sign in"}
        </button>
      </section>
    </main>
  );
}
