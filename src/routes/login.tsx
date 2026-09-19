import { useState, type FormEvent } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { loginApp } from "@/lib/auth.functions";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Secure Login — Clever Trade Shield" },
      { name: "description", content: "Authenticated access to Clever Trade Shield." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await loginApp({ data: { password } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Secure session established");
      await router.invalidate();
      await router.navigate({ to: "/" });
    } catch {
      setError("Login failed. Check the server configuration and try again.");
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
          Dhan credentials remain server-side. This login protects the application and every private server function.
        </div>
        <form className="mt-5 space-y-4" onSubmit={submit}>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Application password</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} disabled={busy} />
            </div>
          </label>
          {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={busy || !password}>
            {busy ? "Authenticating…" : "Unlock terminal"}
          </Button>
        </form>
      </section>
    </main>
  );
}
