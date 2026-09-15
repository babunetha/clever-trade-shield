import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/trading/AppShell";
import { SignalCard } from "@/components/trading/SignalCard";
import { useTrading } from "@/lib/trading/store";
import { formatINR, formatPct, formatPrice, formatSignedINR, tone } from "@/lib/trading/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — ₹1L Trading Assistant" },
      {
        name: "description",
        content:
          "Risk-controlled intraday dashboard for a ₹1,00,000 equity account: simulated signals, manual approval and hard risk limits.",
      },
      { property: "og:title", content: "Dashboard — ₹1L Trading Assistant" },
      {
        property: "og:description",
        content: "Simulated signals with manual approval, ₹500 risk per trade and a ₹1,000 daily loss lock.",
      },
    ],
  }),
  component: Dashboard,
});

function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div className="panel p-4">
      <div className="label-caps">{label}</div>
      <div className={`num mt-1 text-lg font-semibold ${className ?? ""}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Dashboard() {
  const { risk, settings, signals, trades, indices } = useTrading();
  const pending = signals.filter((s) => s.status === "PENDING");
  const open = trades.filter((t) => t.status === "OPEN");
  const lossUsedPct = Math.min(100, (Math.max(0, -risk.realisedPnl) / settings.maxDailyLoss) * 100);

  return (
    <AppShell
      title="Dashboard"
      subtitle="Today's simulated session at a glance. Every trade needs your explicit approval."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Equity (simulated)" value={formatINR(risk.equity)} hint={`Capital ${formatINR(settings.capital)}`} />
        <Stat
          label="Realised P&L today"
          value={formatSignedINR(risk.realisedPnl)}
          className={tone(risk.realisedPnl)}
          hint={`Loss budget left ${formatINR(risk.lossBudgetLeft)}`}
        />
        <Stat
          label="Trades today"
          value={`${risk.tradesToday} / ${settings.maxTradesPerDay}`}
          hint={`${risk.winningTradesToday}W · ${risk.losingTradesToday}L`}
        />
        <Stat
          label="Status"
          value={risk.locked ? "LOCKED" : "ARMED"}
          className={risk.locked ? "text-bear" : "text-bull"}
          hint={risk.locked ? risk.lockReasons[0] : "Within all risk limits"}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Daily loss budget</h2>
            <span className="num text-xs text-muted-foreground">
              {formatINR(Math.max(0, -risk.realisedPnl))} of {formatINR(settings.maxDailyLoss)} used
            </span>
          </div>
          <Progress value={lossUsedPct} className="mt-3" />
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div>
              <div className="label-caps">Open risk</div>
              <div className="num text-sm">{formatINR(risk.openRisk)}</div>
            </div>
            <div>
              <div className="label-caps">Risk per trade cap</div>
              <div className="num text-sm">{formatINR(settings.maxRiskPerTrade)}</div>
            </div>
            <div>
              <div className="label-caps">Trades left</div>
              <div className="num text-sm">{risk.tradesLeft}</div>
            </div>
          </div>
        </div>

        <div className="panel p-4">
          <h2 className="text-sm font-semibold">Index bias</h2>
          <ul className="mt-3 space-y-3">
            {indices.map((i) => (
              <li key={i.symbol} className="flex items-center justify-between">
                <div>
                  <div className="text-sm">{i.symbol}</div>
                  <div className="num text-xs text-muted-foreground">
                    {formatPrice(i.ltp)} <span className={tone(i.change)}>{formatPct(i.changePct)}</span>
                  </div>
                </div>
                <Badge variant="outline">{i.bias}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pending signals awaiting approval ({pending.length})</h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/approvals">Go to approvals</Link>
          </Button>
        </div>
        <div className="mt-3 space-y-3">
          {pending.slice(0, 2).map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
          {!pending.length ? (
            <p className="panel p-4 text-sm text-muted-foreground">
              No pending signals. Generate a fresh simulated batch from the Signals screen.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="text-sm font-semibold">Open simulated positions ({open.length})</h2>
        <div className="mt-3 space-y-2">
          {open.map((t) => (
            <div key={t.id} className="panel flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-semibold">{t.symbol}</span>
              <Badge variant="outline">{t.side}</Badge>
              <span className="num text-xs text-muted-foreground">
                {t.quantity} @ {formatPrice(t.entry)} · SL {formatPrice(t.stopLoss)} · T1 {formatPrice(t.target1)}
              </span>
              <Button asChild size="sm" variant="outline" className="ml-auto">
                <Link to="/journal">Manage in journal</Link>
              </Button>
            </div>
          ))}
          {!open.length ? (
            <p className="panel p-4 text-sm text-muted-foreground">No open simulated positions.</p>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
