import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/trading/AppShell";
import { useTrading } from "@/lib/trading/store";
import { formatINR, formatSignedINR, formatTime, tone } from "@/lib/trading/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/risk")({
  head: () => ({
    meta: [
      { title: "Risk Controls — ₹1L Trading Assistant" },
      {
        name: "description",
        content:
          "Hard risk rails: ₹500 max risk per trade, ₹1,000 daily loss cap, 3 trades a day, lock after two losses, plus a full audit log.",
      },
      { property: "og:title", content: "Risk Controls — ₹1L Trading Assistant" },
      {
        property: "og:description",
        content: "Live view of risk usage, lock reasons and the audit trail of every decision taken.",
      },
    ],
  }),
  component: RiskControls,
});

function Rail({ label, used, cap, unit = "₹" }: { label: string; used: number; cap: number; unit?: string }) {
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="label-caps">{label}</span>
        <span className="num text-xs">
          {unit === "₹" ? `${formatINR(used)} / ${formatINR(cap)}` : `${used} / ${cap}`}
        </span>
      </div>
      <Progress value={pct} className="mt-2" />
    </div>
  );
}

const sevTone = (s: string) => (s === "CRITICAL" ? "text-bear" : s === "WARN" ? "text-warn" : "text-muted-foreground");

function RiskControls() {
  const { risk, settings, audit, setTradingEnabled, resetDay } = useTrading();

  return (
    <AppShell title="Risk Controls" subtitle="Hard rails that block approvals automatically. These cannot be bypassed.">
      <div
        className={`panel p-4 ${risk.locked ? "border-bear/40 bg-bear-muted" : "border-bull/40 bg-bull-muted"}`}
      >
        <div className={`flex items-center gap-2 text-sm font-semibold ${risk.locked ? "text-bear" : "text-bull"}`}>
          {risk.locked ? <ShieldAlert className="size-4" /> : <ShieldCheck className="size-4" />}
          {risk.locked ? "Risk lock active — approvals blocked" : "Armed and within all limits"}
        </div>
        {risk.locked ? (
          <ul className="mt-2 space-y-1 text-xs text-bear">
            {risk.lockReasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={settings.tradingEnabled ? "destructive" : "default"}
            onClick={() => setTradingEnabled(!settings.tradingEnabled)}
          >
            {settings.tradingEnabled ? "Emergency disable trading" : "Re-enable trading"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => resetDay()}>
            Reset simulated day
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Rail label="Daily loss used" used={Math.max(0, -risk.realisedPnl)} cap={settings.maxDailyLoss} />
        <Rail label="Trades used" used={risk.tradesToday} cap={settings.maxTradesPerDay} unit="#" />
        <Rail label="Losing trades" used={risk.losingTradesToday} cap={settings.lockAfterLosingTrades} unit="#" />
        <Rail label="Open risk vs daily cap" used={risk.openRisk} cap={settings.maxDailyLoss} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-4">
          <div className="label-caps">Realised P&L</div>
          <div className={`num text-lg font-semibold ${tone(risk.realisedPnl)}`}>
            {formatSignedINR(risk.realisedPnl)}
          </div>
        </div>
        <div className="panel p-4">
          <div className="label-caps">Risk budget left</div>
          <div className="num text-lg font-semibold">{formatINR(risk.riskBudgetLeft)}</div>
        </div>
        <div className="panel p-4">
          <div className="label-caps">Max risk / trade</div>
          <div className="num text-lg font-semibold">{formatINR(settings.maxRiskPerTrade)}</div>
        </div>
        <div className="panel p-4">
          <div className="label-caps">Instruments</div>
          <div className="text-sm font-semibold">Equity intraday only</div>
          <div className="text-xs text-muted-foreground">F&O / options disabled</div>
        </div>
      </div>

      <section className="panel mt-4 p-4">
        <h2 className="text-sm font-semibold">Audit log</h2>
        <p className="text-xs text-muted-foreground">
          Every approval, rejection, lock and settings change is recorded locally on this device.
        </p>
        <ul className="mt-3 divide-y divide-border">
          {audit.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-2 py-2 text-xs">
              <span className="num text-muted-foreground">{formatTime(a.at)}</span>
              <Badge variant="outline" className="num">
                {a.action}
              </Badge>
              <span className={sevTone(a.severity)}>{a.detail}</span>
            </li>
          ))}
          {!audit.length ? <li className="py-2 text-xs text-muted-foreground">No events recorded yet.</li> : null}
        </ul>
      </section>
    </AppShell>
  );
}
