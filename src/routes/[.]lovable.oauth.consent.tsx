import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type OAuthDetails = {
  redirect_url?: string;
  redirect_to?: string;
  redirect_uri?: string;
  scope?: string;
  client?: { name?: string; redirect_uri?: string };
};
type OAuthResult = { data: OAuthDetails | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Connect an assistant — Clever Trade Shield" },
      { name: "description", content: "Approve or cancel an assistant connection." },
      { property: "og:title", content: "Connect an assistant — Clever Trade Shield" },
      { property: "og:description", content: "Approve or cancel an assistant connection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This connection link is missing its request ID.");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/login", search: { next } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id");
    if (!id) throw new Error("This connection link is missing its request ID.");
    const { data, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw new Error(error.message || "This request has expired or is invalid.");
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    const { data: u } = await supabase.auth.getUser();
    return { details: data, email: u.user?.email ?? "" };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <section className="panel max-w-md p-6 text-sm">
        <h1 className="text-lg font-semibold">Could not load this connection request</h1>
        <p className="mt-2 text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </section>
    </main>
  ),
});

function Consent() {
  const { details, email } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = (details?.client?.name as string | undefined) ?? "An assistant";
  const redirectUri = (details?.redirect_uri ?? details?.client?.redirect_uri) as string | undefined;
  const scopes = String(details?.scope ?? "")
    .split(" ")
    .filter(Boolean);
  const label = (s: string) =>
    s === "openid"
      ? "Confirm who you are"
      : s === "email"
        ? "Share your email address"
        : s === "profile"
          ? "Share your basic profile"
          : `Additional permission requested: ${s}`;

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(approve ? `Approval failed: ${error.message}` : `Cancel failed: ${error.message}`);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect was returned. Please try connecting again.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="panel w-full max-w-md space-y-4 p-6 text-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="text-lg font-semibold">Connect {client} to Clever Trade Shield</h1>
        </div>
        <p>
          {client} will be able to read your paper trades, audit log and risk limits while you are
          signed in as <strong>{email}</strong>. It cannot place or change trades.
        </p>
        {redirectUri ? (
          <p className="text-xs text-muted-foreground">Returns to: {redirectUri}</p>
        ) : null}
        {scopes.length ? (
          <ul className="list-disc space-y-1 pl-5 text-xs">
            {scopes.map((s) => (
              <li key={s}>{label(s)}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground">
          This does not bypass this app's permissions or backend policies.
        </p>
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            Approve
          </Button>
          <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>
            Cancel connection
          </Button>
        </div>
      </section>
    </main>
  );
}
