import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Lock, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getDhanAccount, getDhanStatus, testDhanConnection } from "@/lib/dhan.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; clientId: string; validity: string | null; segments: string | null }
  | { kind: "error"; message: string };

type AccountState = Awaited<ReturnType<typeof getDhanAccount>> | null;

const inr = (v: number | null) =>
  v === null ? "—" : `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DhanConnection() {
  const status = useQuery({ queryKey: ["dhan-status"], queryFn: () => getDhanStatus() });
  const runTest = useServerFn(testDhanConnection);
  const runAccount = useServerFn(getDhanAccount);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [account, setAccount] = useState<AccountState>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);

  const configured = Boolean(status.data?.clientIdConfigured && status.data?.accessTokenConfigured);
  const live = status.data?.mode === "LIVE_READ_ONLY";

  const onTest = async () => {
    setTest({ kind: "running" });
    const result = await runTest({});
    if (result.ok) {
      setTest({
        kind: "ok",
        clientId: result.data.dhanClientIdMasked,
        validity: result.data.tokenValidity,
        segments: result.data.activeSegments,
      });
      toast.success("Dhan connection verified (read-only)");
    } else {
      setTest({ kind: "error", message: result.error });
      toast.error(result.error);
    }
  };

  const onLoadAccount = async () => {
    setLoadingAccount(true);
    try {
      const result = await runAccount({});
      setAccount(result);
      const failed = [result.funds, result.holdings, result.positions].find((r) => !r.ok);
      if (failed && !failed.ok) toast.error(failed.error);
      else toast.success("Live account snapshot loaded");
    } finally {
      setLoadingAccount(false);
    }
  };

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Dhan Connection</h2>
        {status.isLoading ? (
          <Badge variant="secondary" className="num">
            CHECKING…
          </Badge>
        ) : live ? (
          <Badge className="num bg-success text-success-foreground">LIVE DATA · READ-ONLY</Badge>
        ) : (
          <Badge variant="secondary" className="num">
            SIMULATED — NOT CONNECTED
          </Badge>
        )}
        <Badge variant="destructive" className="num ml-auto">
          <Lock className="mr-1 size-3" /> ORDERS DISABLED
        </Badge>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        The broker connection runs entirely on the server. Your Dhan client ID and access token are read from backend
        secrets inside server code only — they are never sent to this page, never written to logs, and never stored in
        the app. Do not type them into chat.
      </p>

      <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <dt className="label-caps">DHAN_CLIENT_ID</dt>
          <dd className={status.data?.clientIdConfigured ? "text-success" : "text-muted-foreground"}>
            {status.data?.clientIdConfigured ? "configured" : "missing"}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="label-caps">DHAN_ACCESS_TOKEN</dt>
          <dd className={status.data?.accessTokenConfigured ? "text-success" : "text-muted-foreground"}>
            {status.data?.accessTokenConfigured ? "configured" : "missing"}
          </dd>
        </div>
      </dl>

      {!configured && !status.isLoading ? (
        <div className="mt-3 rounded-md border border-warn/40 bg-warn-muted p-3 text-xs text-warn">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-3.5" /> Credentials must be added as backend secrets
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-warn/90">
            <li>Generate an access token in the Dhan web console under My Profile → DhanHQ Trading APIs.</li>
            <li>
              In this project open Settings → Secrets and add <span className="num">DHAN_CLIENT_ID</span> and{" "}
              <span className="num">DHAN_ACCESS_TOKEN</span>.
            </li>
            <li>Return here and press “Test connection”. Until then every screen keeps using simulated data.</li>
          </ol>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onTest} disabled={test.kind === "running"}>
          {test.kind === "running" ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <PlugZap className="mr-1 size-3.5" />
          )}
          Test connection
        </Button>
        <Button size="sm" variant="outline" onClick={onLoadAccount} disabled={!configured || loadingAccount}>
          {loadingAccount ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 size-3.5" />
          )}
          Fetch funds, holdings & positions
        </Button>
        <Button size="sm" variant="outline" onClick={() => status.refetch()}>
          Recheck secrets
        </Button>
      </div>

      {test.kind === "ok" ? (
        <div className="mt-3 rounded-md border border-success/40 bg-success-muted p-3 text-xs text-success">
          <p className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="size-3.5" /> Connected — read-only
          </p>
          <p className="mt-1 num">
            Client {test.clientId}
            {test.validity ? ` · token valid till ${test.validity}` : ""}
            {test.segments ? ` · segments ${test.segments}` : ""}
          </p>
        </div>
      ) : null}

      {test.kind === "error" ? (
        <p className="mt-3 rounded-md border border-danger/40 bg-danger-muted p-3 text-xs text-danger">{test.message}</p>
      ) : null}

      {account ? (
        <div className="mt-3 space-y-2 text-xs">
          <div className="label-caps text-success">LIVE DATA · fetched from Dhan</div>
          {account.funds.ok ? (
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                ["Available", account.funds.data.availableBalance],
                ["Withdrawable", account.funds.data.withdrawableBalance],
                ["Utilised", account.funds.data.utilisedAmount],
                ["Collateral", account.funds.data.collateralAmount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md border border-border p-2">
                  <div className="label-caps">{String(label)}</div>
                  <div className="num">{inr(value as number | null)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-danger">{account.funds.error}</p>
          )}

          <div>
            <div className="label-caps">Holdings</div>
            {!account.holdings.ok ? (
              <p className="text-danger">{account.holdings.error}</p>
            ) : account.holdings.data.length ? (
              <ul className="num mt-1 space-y-0.5">
                {account.holdings.data.map((h) => (
                  <li key={`${h.exchange}-${h.symbol}`}>
                    {h.symbol} · {h.quantity} @ {inr(h.averagePrice)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No holdings reported.</p>
            )}
          </div>

          <div>
            <div className="label-caps">Positions</div>
            {!account.positions.ok ? (
              <p className="text-danger">{account.positions.error}</p>
            ) : account.positions.data.length ? (
              <ul className="num mt-1 space-y-0.5">
                {account.positions.data.map((p) => (
                  <li key={`${p.symbol}-${p.productType}`}>
                    {p.symbol} · {p.productType} · net {p.netQuantity} · unrealised {inr(p.unrealisedProfit)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No open positions reported.</p>
            )}
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Wired Dhan endpoints (all read-only): <span className="num">GET /v2/profile</span>,{" "}
        <span className="num">GET /v2/fundlimit</span>, <span className="num">GET /v2/holdings</span>,{" "}
        <span className="num">GET /v2/positions</span>, <span className="num">POST /v2/marketfeed/ltp</span>. Order
        endpoints are not called by this build under any circumstance; approvals and risk limits will still gate them
        when live execution is eventually reviewed and enabled.
      </p>
    </section>
  );
}
