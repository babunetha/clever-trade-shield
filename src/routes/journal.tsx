import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/trading/AppShell";
import { getDhanMarketSnapshot } from "@/lib/market.functions";
import { coachJournalSession } from "@/lib/ai-analysis.functions";
import { useTrading } from "@/lib/trading/store";
import {
  formatDateTime,
  formatINR,
  formatPrice,
  formatSignedINR,
  tone,
} from "@/lib/trading/format";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [
      { title: "Trade Journal — ₹1L Trading Assistant" },
      {
        name: "description",
        content:
          "Log of every approved simulated trade with entry, stop, exit, P&L, R-multiple and your own review notes.",
      },
      { property: "og:title", content: "Trade Journal — ₹1L Trading Assistant" },
      {
        property: "og:description",
        content: "Review simulated fills, close positions manually and keep notes on what worked.",
      },
    ],
  }),
  component: Journal,
});

function Journal() {
  const { trades, closeTrade, updateNotes, quotes, log } = useTrading();
  const [exits, setExits] = useState<Record<string, string>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [liveMode, setLiveMode] = useState(false);
  const [liveAsOf, setLiveAsOf] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const symbols = useMemo(
    () => [...new Set(trades.filter((t) => t.status === "OPEN").map((t) => t.symbol))],
    [trades],
  );

  const refreshLive = useCallback(async () => {
    if (!symbols.length) {
      setLiveMode(false);
      return;
    }
    setRefreshing(true);
    try {
      const result = await getDhanMarketSnapshot({ data: { symbols } });
      if (!result.ok) {
        setLiveMode(false);
        setLiveError(result.error);
        return;
      }
      const prices: Record<string, number> = {};
      for (const [symbol, quote] of Object.entries(result.data.quotes)) prices[symbol] = quote.ltp;
      if (Object.keys(prices).length) {
        setLivePrices(prices);
        setLiveMode(true);
        setLiveError(null);
        setLiveAsOf(result.data.asOf);
      } else {
        setLiveMode(false);
        setLiveError("Dhan returned no live prices for the open paper positions.");
      }
    } catch (error) {
      setLiveMode(false);
      setLiveError(error instanceof Error ? error.message : "Dhan live-price request failed");
    } finally {
      setRefreshing(false);
    }
  }, [symbols]);

  useEffect(() => {
    void refreshLive();
    const timer = window.setInterval(() => void refreshLive(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshLive]);

  const closed = trades.filter((t) => t.status === "CLOSED");
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const avgR = closed.length
    ? Number((closed.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / closed.length).toFixed(2))
    : 0;
  const unrealisedPnl = trades
    .filter((t) => t.status === "OPEN")
    .reduce((sum, t) => {
      const current =
        livePrices[t.symbol] ?? quotes.find((q) => q.symbol === t.symbol)?.ltp ?? t.entry;
      return sum + (current - t.entry) * t.quantity * (t.side === "LONG" ? 1 : -1);
    }, 0);
  const grossProfit = closed.filter((t) => (t.pnl ?? 0) > 0).reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(
    closed.filter((t) => (t.pnl ?? 0) < 0).reduce((s, t) => s + (t.pnl ?? 0), 0),
  );
  const profitFactor = grossLoss
    ? Number((grossProfit / grossLoss).toFixed(2))
    : closed.length
      ? "∞"
      : "—";

  // AI discipline coach: analysis only — it reads closed simulated trades and
  // stats, never places orders and cannot change the risk rules.
  const coach = useServerFn(coachJournalSession);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachResult, setCoachResult] = useState<string | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);

  const runCoach = async () => {
    setCoachLoading(true);
    setCoachError(null);
    log("AI_COACH_RUN", `Session review requested over ${closed.length} closed trades`);
    try {
      const result = await coach({
        data: {
          stats: {
            totalTrades: trades.length,
            closedTrades: closed.length,
            openPositions: trades.length - closed.length,
            winRatePct: closed.length ? Math.round((wins / closed.length) * 100) : 0,
            netPnl: Number(totalPnl.toFixed(2)),
            avgR,
            profitFactor: typeof profitFactor === "number" ? profitFactor : String(profitFactor),
            grossProfit: Number(grossProfit.toFixed(2)),
            grossLoss: Number(grossLoss.toFixed(2)),
            maxRiskPerTrade: 500,
            maxDailyLoss: 1000,
            maxTradesPerDay: 3,
          },
          trades: closed.slice(0, 30).map((t) => ({
            symbol: t.symbol,
            side: t.side,
            entry: t.entry,
            exit: t.exit ?? null,
            pnl: t.pnl ?? null,
            rMultiple: t.rMultiple ?? null,
            exitReason: t.exitReason ?? null,
            notes: t.notes,
            openedAt: t.openedAt,
            closedAt: t.closedAt ?? null,
          })),
        },
      });
      if (!result.ok) {
        setCoachError(result.error);
        log("AI_COACH_BLOCKED", result.error, "WARN");
        toast.error(result.error);
      } else {
        setCoachResult(result.review);
        log("AI_COACH_RESULT", "Session review generated");
        toast.success("Session review ready");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI review failed.";
      setCoachError(message);
      log("AI_COACH_BLOCKED", message, "WARN");
      toast.error(message);
    } finally {
      setCoachLoading(false);
    }
  };

  return (
    <AppShell
      title="Trade Journal"
      subtitle="Paper trades can be marked against live Dhan prices; no broker order is required."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant={liveMode ? "default" : "outline"}>
          {liveMode ? "DHAN LIVE MARKING" : "SIMULATED FALLBACK"}
        </Badge>
        {liveAsOf ? (
          <span className="num text-xs text-muted-foreground">
            Updated {new Date(liveAsOf).toLocaleTimeString()}
          </span>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => void refreshLive()}
          disabled={refreshing || !symbols.length}
        >
          <RefreshCw className={`mr-1 size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh live
          prices
        </Button>
      </div>
      {liveError ? (
        <div className="mb-3 rounded-lg border border-warn/40 bg-warn-muted p-3 text-xs text-warn">
          {liveError}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="panel p-4">
          <div className="label-caps">Trades logged</div>
          <div className="num text-lg font-semibold">{trades.length}</div>
        </div>
        <div className="panel p-4">
          <div className="label-caps">Win rate</div>
          <div className="num text-lg font-semibold">
            {closed.length ? Math.round((wins / closed.length) * 100) : 0}%
          </div>
        </div>
        <div className="panel p-4">
          <div className="label-caps">Net P&L (closed)</div>
          <div className={`num text-lg font-semibold ${tone(totalPnl)}`}>
            {formatSignedINR(totalPnl)}
          </div>
        </div>
        <div className="panel p-4">
          <div className="label-caps">Average R</div>
          <div className={`num text-lg font-semibold ${tone(avgR)}`}>{avgR}</div>
        </div>
      </div>

      <div className="panel mt-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">AI session review</h2>
          <Badge variant="outline">ANALYSIS ONLY</Badge>
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => void runCoach()}
            disabled={coachLoading || !closed.length}
          >
            {coachLoading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            {coachLoading ? "Reviewing…" : "Analyze my session"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Reviews your closed simulated trades and stats against your hard risk rules. The coach
          never places orders and cannot change the risk limits.
        </p>
        {coachError ? (
          <div className="mt-3 rounded-md border border-bear/40 bg-bear-muted p-3 text-xs text-bear">
            {coachError}
          </div>
        ) : null}
        {coachResult ? (
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
            {coachResult}
          </pre>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {trades.map((t) => {
          const live =
            livePrices[t.symbol] ?? quotes.find((q) => q.symbol === t.symbol)?.ltp ?? t.entry;
          return (
            <div key={t.id} className="panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t.symbol}</span>
                <Badge variant="outline">{t.side}</Badge>
                <Badge variant={t.status === "OPEN" ? "secondary" : "outline"}>{t.status}</Badge>
                <Badge variant="secondary">SIMULATED</Badge>
                {t.outcome ? (
                  <span className={`num text-sm ${tone(t.pnl ?? 0)}`}>
                    {t.outcome} {formatSignedINR(t.pnl ?? 0)} · {t.rMultiple}R
                  </span>
                ) : null}
                <span className="ml-auto num text-xs text-muted-foreground">
                  {formatDateTime(t.openedAt)}
                </span>
              </div>

              <div className="mt-2 num text-xs text-muted-foreground">
                {t.quantity} qty · entry {formatPrice(t.entry)} · SL {formatPrice(t.stopLoss)} · T1{" "}
                {formatPrice(t.target1)} · risk{" "}
                {formatINR(Math.abs(t.entry - t.stopLoss) * t.quantity)}
                {t.exit ? ` · exit ${formatPrice(t.exit)}` : ` · live mark ${formatPrice(live)}`}
              </div>

              {t.status === "OPEN" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    className="h-9 w-36"
                    inputMode="decimal"
                    placeholder={`Exit ${formatPrice(live)}`}
                    value={exits[t.id] ?? ""}
                    onChange={(e) => setExits((p) => ({ ...p, [t.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const value = Number(exits[t.id] ?? live);
                      if (!Number.isFinite(value) || value <= 0) {
                        toast.error("Enter a valid exit price");
                        return;
                      }
                      closeTrade(t.id, value);
                      toast.success(`${t.symbol} closed at ${formatPrice(value)} (simulated)`);
                    }}
                  >
                    Close at price
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => closeTrade(t.id, t.stopLoss)}>
                    Stopped out
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => closeTrade(t.id, t.target1)}>
                    Target hit
                  </Button>
                </div>
              ) : null}

              <Textarea
                className="mt-3 min-h-16 text-sm"
                placeholder="Review notes: what did you see, what would you do differently?"
                value={t.notes}
                onChange={(e) => updateNotes(t.id, e.target.value)}
              />
            </div>
          );
        })}
        {!trades.length ? (
          <p className="panel p-4 text-sm text-muted-foreground">
            No trades yet. Approve a signal on the Trade Approval screen to log a simulated trade.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
