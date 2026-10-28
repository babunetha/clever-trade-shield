import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MoonStar, XCircle } from "lucide-react";
import { AppShell } from "@/components/trading/AppShell";
import { getDhanStatus } from "@/lib/dhan.functions";
import { useTrading } from "@/lib/trading/store";
import { formatINR, formatPrice } from "@/lib/trading/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/checklist")({
  head: () => ({
    meta: [
      { title: "Pre-Market Checklist — ₹1L Trading Assistant" },
      {
        name: "description",
        content:
          "Pre-session readiness check: broker credential status, risk budgets, open positions, pending approvals and the day's loss limits before the 09:20 IST session opens.",
      },
      { property: "og:title", content: "Pre-Market Checklist — ₹1L Trading Assistant" },
      {
        property: "og:description",
        content:
          "Confirm credentials, risk budgets and session configuration before trading. No live orders.",
      },
    ],
  }),
  component: Checklist,
});

interface CheckItem {
  label: string;
  ok: boolean;
  detail: string;
  /** Items that are only relevant once live data is configured. */
  liveOnly?: boolean;
}

function Checklist() {
  const { settings, risk, trades, signals, quotes, indices, setTradingEnabled } = useTrading();
  const dhanStatus = useQuery({
    queryKey: ["dhan-status"],
    queryFn: () => getDhanStatus(),
    staleTime: 60_000,
  });
  const brokerConfigured = Boolean(
    dhanStatus.data?.clientIdConfigured && dhanStatus.data?.accessTokenConfigured,
  );

  const openPositions = trades.filter((t) => t.status === "OPEN");
  const pendingApprovals = signals.filter((s) => s.status === "PENDING");
  const losingToday = risk.losingTradesToday;
  const nifty = indices[0];

  const items: CheckItem[] = [
    {
      label: "Risk engine unlocked",
      ok: !risk.locked,
      detail: risk.locked
        ? risk.lockReasons.join("; ")
        : `Trades left today ${risk.tradesLeft} · loss budget left ${formatINR(risk.lossBudgetLeft)} · risk budget left ${formatINR(risk.riskBudgetLeft)}`,
    },
    {
      label: "Daily loss budget intact",
      ok: risk.lossBudgetLeft > 0,
      detail:
        risk.lossBudgetLeft > 0
          ? `${formatINR(risk.lossBudgetLeft)} of ${formatINR(settings.maxDailyLoss)} still available today`
          : "Daily loss cap of " + formatINR(settings.maxDailyLoss) + " reached — trading stays locked until the next session",
    },
    {
      label: "Weekly loss budget intact",
      ok: risk.weeklyRealisedPnl > -settings.weeklyLossLimit,
      detail:
        risk.weeklyRealisedPnl > -settings.weeklyLossLimit
          ? `Rolling 7-day P&L ${formatINR(risk.weeklyRealisedPnl)} against the ${formatINR(settings.weeklyLossLimit)} weekly loss cap`
          : `Weekly loss cap of ${formatINR(settings.weeklyLossLimit)} breached — wait for the rolling window to recover`,
    },
    {
      label: "Consecutive-loss lock clear",
      ok: losingToday < settings.lockAfterLosingTrades,
      detail:
        losingToday < settings.lockAfterLosingTrades
          ? `${losingToday} losing trade${losingToday === 1 ? "" : "s"} today (lock at ${settings.lockAfterLosingTrades})`
          : `${losingToday} consecutive losses — the terminal stays locked for the rest of the day`,
    },
    {
      label: "Trading master switch on",
      ok: settings.tradingEnabled,
      detail: settings.tradingEnabled
        ? "Emergency trading switch is enabled"
        : "Trading was disabled from the header — re-enable only after reviewing why it was turned off",
    },
    {
      label: "No open positions carried into the session",
      ok: openPositions.length === 0,
      detail:
        openPositions.length === 0
          ? "No open paper positions — intraday-only profile starts flat"
          : `${openPositions.length} open position${openPositions.length === 1 ? "" : "s"}: ${openPositions.map((t) => t.symbol).join(", ")} — close them in the journal before opening new risk`,
    },
    {
      label: "Pending approvals reviewed",
      ok: pendingApprovals.length <= settings.maxTradesPerDay,
      detail:
        pendingApprovals.length === 0
          ? "No signals waiting for approval"
          : `${pendingApprovals.length} signal${pendingApprovals.length === 1 ? "" : "s"} awaiting a decision (max ${settings.maxTradesPerDay} trades/day): ${pendingApprovals.map((s) => s.symbol).join(", ")}`,
    },
    {
      label: "Broker credentials configured (server-side)",
      ok: brokerConfigured,
      detail: dhanStatus.isLoading
        ? "Checking server-side credential status…"
        : brokerConfigured
          ? `Dhan connection ready — client id ${dhanStatus.data?.clientIdMasked ?? "configured"}; read-only data access`
          : "DHAN_CLIENT_ID / DHAN_ACCESS_TOKEN are not configured on the server — add them as backend secrets in Settings → Dhan connection. Simulated data stays the source of truth until then",
    },
    {
      label: "Market session configured",
      ok: settings.sessionStart === "09:20" && settings.sessionEnd === "15:10",
      detail: `Trading window ${settings.sessionStart}–${settings.sessionEnd} IST · equity intraday ${settings.intradayOnly ? "only" : "off"} · F&O ${settings.allowFno ? "ENABLED (must stay off)" : "disabled"}`,
      liveOnly: false,
    },
  ];

  const liveOnlyItems = items.filter((i) => i.liveOnly);
  const blocking = items.filter((i) => !i.ok);
  const allClear = blocking.length === 0;

  return (
    <AppShell
      title="Pre-Market Checklist"
      subtitle="Run this before 09:20 IST each session. Nothing here places orders — it only confirms the risk state before you take the first trade."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          {brokerConfigured ? "LIVE DATA · READ-ONLY" : "SIMULATED / MOCK DATA"}
        </Badge>
        <Badge variant="destructive">LIVE ORDERS OFF</Badge>
        <Badge variant={allClear ? "default" : "secondary"} className="ml-auto num">
          {items.length - blocking.length}/{items.length} CLEAR
        </Badge>
      </div>

      <div
        className={`panel mb-4 flex flex-wrap items-center gap-3 p-4 text-sm ${allClear ? "border-success/40 bg-success-muted text-success" : "border-warn/40 bg-warn-muted text-warn"}`}
      >
        {dhanStatus.isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Checking readiness…
          </>
        ) : allClear ? (
          <>
            <CheckCircle2 className="size-4" />
            <span>
              Ready for the session. Capital {formatINR(settings.capital)} · per-trade risk{" "}
              {formatINR(settings.maxRiskPerTrade)} · max {settings.maxTradesPerDay} trades today.
            </span>
          </>
        ) : (
          <>
            <XCircle className="size-4" />
            <span>
              {blocking.length} item{blocking.length === 1 ? "" : "s"} need attention before the
              first trade. Fix the red rows below.
            </span>
          </>
        )}
      </div>

      <div className="panel divide-y divide-border p-0">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-3 p-3">
            {dhanStatus.isLoading ? (
              <Loader2 className="mt-0.5 size-4 animate-spin text-muted-foreground" />
            ) : item.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 text-success" />
            ) : (
              <XCircle className="mt-0.5 size-4 text-bear" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium">{item.label}</div>
              <div className="mt-0.5 num text-xs text-muted-foreground">{item.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="label-caps">Nifty bias (simulated)</div>
          <div className="num text-lg font-semibold">
            {nifty ? `${formatPrice(nifty.ltp)} · ${nifty.bias}` : "—"}
          </div>
        </div>
        <div className="panel p-4">
          <div className="label-caps">Open risk</div>
          <div className="num text-lg font-semibold">{formatINR(risk.openRisk)}</div>
        </div>
        <div className="panel p-4">
          <div className="label-caps">Equity</div>
          <div className="num text-lg font-semibold">{formatINR(risk.equity)}</div>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        {quotes.length} instruments tracked on simulated ticks{liveOnlyItems.length ? " · live-only checks are skipped until broker data is configured" : ""}. The
        checklist re-checks everything each time you open this page.
      </p>

      {!settings.tradingEnabled ? (
        <Button size="sm" className="mt-3" onClick={() => setTradingEnabled(true)}>
          Re-enable trading switch
        </Button>
      ) : null}

      <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <MoonStar className="size-4" /> After 15:10 IST close any open positions, note the day in
        the journal, and review the Risk Controls screen before the next session.
      </div>
    </AppShell>
  );
}
