import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/trading/AppShell";
import { getDhanMarketSnapshot } from "@/lib/market.functions";
import { useTrading } from "@/lib/trading/store";
import type { IndexQuote, Quote } from "@/lib/trading/types";
import { formatCompact, formatPct, formatPrice, tone } from "@/lib/trading/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/market")({
  head: () => ({
    meta: [
      { title: "Market Overview — Clever Trade Shield" },
      { name: "description", content: "Live Dhan market snapshot with a clearly labelled simulated fallback." },
    ],
  }),
  component: MarketOverview,
});

const WATCHLIST = [
  "RELIANCE", "HDFCBANK", "INFY", "TATAMOTORS", "SBIN", "ICICIBANK",
  "ITC", "AXISBANK", "TATASTEEL", "LT", "MARUTI", "BHARTIARTL",
  "NIFTY", "BANKNIFTY",
];

function MarketOverview() {
  const { quotes: simulatedQuotes, indices: simulatedIndices } = useTrading();
  const [quotes, setQuotes] = useState<Quote[]>(simulatedQuotes);
  const [indices, setIndices] = useState<IndexQuote[]>(simulatedIndices);
  const [mode, setMode] = useState<"LIVE" | "SIMULATED">("SIMULATED");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await getDhanMarketSnapshot({ symbols: WATCHLIST });
      if (!result.ok) {
        setMode("SIMULATED");
        setError(result.error);
        return;
      }
      const data = result.data.quotes;
      const realQuotes = WATCHLIST
        .filter((symbol) => symbol !== "NIFTY" && symbol !== "BANKNIFTY")
        .map((symbol) => data[symbol])
        .filter(Boolean)
        .map((q) => ({
          symbol: q.symbol,
          name: q.name,
          ltp: q.ltp,
          prevClose: q.prevClose,
          change: q.change,
          changePct: q.changePct,
          dayHigh: q.dayHigh,
          dayLow: q.dayLow,
          volume: q.volume,
        }));
      const realIndices = [
        ["NIFTY", "Nifty 50"],
        ["BANKNIFTY", "Nifty Bank"],
      ].map(([symbol, name]) => data[symbol] ? {
        ...data[symbol],
        symbol,
        name,
        bias: data[symbol].changePct > 0.25 ? "BULLISH" : data[symbol].changePct < -0.25 ? "BEARISH" : "NEUTRAL",
      } : null).filter(Boolean) as IndexQuote[];

      if (realQuotes.length) {
        setQuotes(realQuotes);
        if (realIndices.length) setIndices(realIndices);
        setMode("LIVE");
        setError(null);
        setAsOf(result.data.asOf);
      } else {
        setMode("SIMULATED");
        setError("Dhan returned no watchlist instruments. Check the Dhan instrument master and API access.");
      }
    } catch (e) {
      setMode("SIMULATED");
      setError(e instanceof Error ? e.message : "Dhan market request failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const gainers = useMemo(() => [...quotes].sort((a, b) => b.changePct - a.changePct).slice(0, 3), [quotes]);
  const losers = useMemo(() => [...quotes].sort((a, b) => a.changePct - b.changePct).slice(0, 3), [quotes]);

  return (
    <AppShell title="Market Overview" subtitle={mode === "LIVE" ? "Dhan live quote snapshot · read-only" : "Simulated fallback · connect Dhan to enable live data"}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant={mode === "LIVE" ? "default" : "outline"}>
          {mode === "LIVE" ? <><Wifi className="mr-1 size-3" /> DHAN LIVE</> : <><WifiOff className="mr-1 size-3" /> SIMULATED</>}
        </Badge>
        {asOf ? <span className="num text-xs text-muted-foreground">Updated {new Date(asOf).toLocaleTimeString()}</span> : null}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw className={`mr-1.5 size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      {error ? <div className="mb-3 rounded-lg border border-warn/40 bg-warn-muted p-3 text-xs text-warn">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {indices.map((i) => (
          <div key={i.symbol} className="panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="label-caps">{i.name}</div>
                <div className="num text-2xl font-semibold">{formatPrice(i.ltp)}</div>
                <div className={`num text-sm ${tone(i.change)}`}>{formatPrice(i.change)} ({formatPct(i.changePct)})</div>
              </div>
              <Badge variant="outline">{i.bias}</Badge>
            </div>
            <div className="mt-3 num text-xs text-muted-foreground">
              Day {formatPrice(i.dayLow)} – {formatPrice(i.dayHigh)} · prev close {formatPrice(i.prevClose)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <h2 className="text-sm font-semibold text-bull">Top gainers</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {gainers.map((q) => <li key={q.symbol} className="flex justify-between"><span>{q.symbol}</span><span className={`num ${tone(q.change)}`}>{formatPct(q.changePct)}</span></li>)}
          </ul>
        </div>
        <div className="panel p-4">
          <h2 className="text-sm font-semibold text-bear">Top losers</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {losers.map((q) => <li key={q.symbol} className="flex justify-between"><span>{q.symbol}</span><span className={`num ${tone(q.change)}`}>{formatPct(q.changePct)}</span></li>)}
          </ul>
        </div>
      </div>

      <div className="panel mt-3 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Symbol</TableHead><TableHead className="text-right">LTP</TableHead><TableHead className="text-right">Change</TableHead>
            <TableHead className="text-right">%</TableHead><TableHead className="text-right">Day low</TableHead><TableHead className="text-right">Day high</TableHead><TableHead className="text-right">Volume</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {quotes.map((q) => <TableRow key={q.symbol}>
              <TableCell><div className="font-medium">{q.symbol}</div><div className="text-xs text-muted-foreground">{q.name}</div></TableCell>
              <TableCell className="num text-right">{formatPrice(q.ltp)}</TableCell>
              <TableCell className={`num text-right ${tone(q.change)}`}>{formatPrice(q.change)}</TableCell>
              <TableCell className={`num text-right ${tone(q.change)}`}>{formatPct(q.changePct)}</TableCell>
              <TableCell className="num text-right">{formatPrice(q.dayLow)}</TableCell>
              <TableCell className="num text-right">{formatPrice(q.dayHigh)}</TableCell>
              <TableCell className="num text-right">{formatCompact(q.volume)}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
