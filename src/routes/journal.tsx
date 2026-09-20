import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/trading/AppShell";
import { getDhanMarketSnapshot } from "@/lib/market.functions";
import { useTrading } from "@/lib/trading/store";
import { formatDateTime, formatINR, formatPrice, formatSignedINR, tone } from "@/lib/trading/format";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
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
  const { trades, closeTrade, updateNotes, quotes } = useTrading();
  const [exits, setExits] = useState<Record<string, string>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [liveMode, setLiveMode] = useState(false);
  const [liveAsOf, setLiveAsOf] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const symbols = useMemo(() => [...new Set(trades.filter((t) => t.status === "OPEN").map((t) => t.symbol))], [trades]);

  const refreshLive = useCallback(async () => {
    if (!symbols.length) { setLiveMode(false); return; }
    setRefreshing(true);
    try {
      const result = await getDhanMarketSnapshot({ data: { symbols } });
      if (!result.ok) { setLiveMode(false); setLiveError(result.error); return; }
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

  return (
    <AppShell title="Trade Journal" subtitle="Paper trades can be marked against live Dhan prices; no broker order is required.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant={liveMode ? "default" : "outline"}>{liveMode ? "DHAN LIVE MARKING" : "SIMULATED FALLBACK"}</Badge>
        {liveAsOf ? <span className="num text-xs text-muted-foreground">Updated {new Date(liveAsOf).toLocaleTimeString()}</span> : null}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => void refreshLive()} disabled={refreshing || !symbols.length}>
          <RefreshCw className={`mr-1 size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh live prices
        </Button>
      </div>
      {liveError ? <div className="mb-3 rounded-lg border border-warn/40 bg-warn-muted p-3 text-xs text-warn">{liveError}</div> : null>
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
          <div className={`num text-lg font-semibold ${tone(totalPnl)}`}>{formatSignedINR(totalPnl)}</div>
        </div>
        <div className="panel p-4">
          <div className="label-caps">Average R</div>
          <div className={`num text-lg font-semibold ${tone(avgR)}`}>{avgR}</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {trades.map((t) => {
          const live = livePrices[t.symbol] ?? quotes.find((q) => q.symbol === t.symbol)?.ltp ?? t.entry;
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
                <span className="ml-auto num text-xs text-muted-foreground">{formatDateTime(t.openedAt)}</span>
              </div>

              <div className="mt-2 num text-xs text-muted-foreground">
                {t.quantity} qty · entry {formatPrice(t.entry)} · SL {formatPrice(t.stopLoss)} · T1{" "}
                {formatPrice(t.target1)} · risk {formatINR(Math.abs(t.entry - t.stopLoss) * t.quantity)}
                {t.exit ? ` · exit ${formatPrice(t.exit)}` : ` · simulated LTP ${formatPrice(live)}`}
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
