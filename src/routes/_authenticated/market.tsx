import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/trading/AppShell";
import { getDhanMarketSnapshot } from "@/lib/market.functions";
import { useTrading } from "@/lib/trading/store";
import type { IndexQuote } from "@/lib/trading/types";
import { formatCompact, formatPct, formatPrice, tone } from "@/lib/trading/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/market")({
  head: () => ({
    meta: [
      { title: "Market Overview — Clever Trade Shield" },
      { property: "og:title", content: "Market Overview — Clever Trade Shield" },
      {
        property: "og:description",
        content: "Read-only NSE market snapshots from verified Dhan provider timestamps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content: "Read-only Dhan market snapshot with stale data blocked.",
      },
    ],
  }),
  component: MarketOverview,
});

const WATCHLIST = [
  "RELIANCE",
  "HDFCBANK",
  "INFY",
  "TATAMOTORS",
  "SBIN",
  "ICICIBANK",
  "ITC",
  "AXISBANK",
  "TATASTEEL",
  "LT",
  "MARUTI",
  "BHARTIARTL",
  "NIFTY",
  "BANKNIFTY",
];

function MarketOverview() {
  const { quotes, indices, publishMarketSnapshot } = useTrading();
  const [mode, setMode] = useState<"LIVE" | "UNAVAILABLE">("UNAVAILABLE");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await getDhanMarketSnapshot({ data: { symbols: WATCHLIST } });
      if (!result.ok) {
        publishMarketSnapshot([], []);
        setMode("UNAVAILABLE");
        setAsOf(null);
        setError(result.error);
        return;
      }
      const data = result.data.quotes;
      const realQuotes = WATCHLIST.filter((symbol) => symbol !== "NIFTY" && symbol !== "BANKNIFTY")
        .map((symbol) => data[symbol])
        .filter((q): q is NonNullable<typeof q> => Boolean(q))
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
      ]
        .map(([symbol, name]) => {
          const row = symbol ? data[symbol] : undefined;
          if (!row) return null;
          return {
            ...row,
            symbol: symbol as string,
            name: name as string,
            bias: row.changePct > 0.25 ? "BULLISH" : row.changePct < -0.25 ? "BEARISH" : "NEUTRAL",
          };
        })
        .filter(Boolean) as IndexQuote[];

      if (realQuotes.length || realIndices.length) {
        publishMarketSnapshot(realQuotes, realIndices);
        setMode("LIVE");
        setError(
          result.data.missingSymbols.length
            ? "No fresh Dhan quote for: " + result.data.missingSymbols.join(", ")
            : null,
        );
        const sourceTimes = Object.values(data)
          .map((row) => row.sourceTimestamp)
          .filter((value): value is string => Boolean(value))
          .map(Date.parse)
          .filter(Number.isFinite);
        setAsOf(sourceTimes.length ? new Date(Math.max(...sourceTimes)).toISOString() : null);
      } else {
        publishMarketSnapshot([], []);
        setMode("UNAVAILABLE");
        setAsOf(null);
        setError(
          "Dhan returned no fresh watchlist quotes. Check credentials, market session and provider timestamps.",
        );
      }
    } catch (e) {
      publishMarketSnapshot([], []);
      setMode("UNAVAILABLE");
      setAsOf(null);
      setError(e instanceof Error ? e.message : "Dhan market request failed");
    } finally {
      setRefreshing(false);
    }
  }, [publishMarketSnapshot]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const gainers = useMemo(
    () => [...quotes].sort((a, b) => b.changePct - a.changePct).slice(0, 3),
    [quotes],
  );
  const losers = useMemo(
    () => [...quotes].sort((a, b) => a.changePct - b.changePct).slice(0, 3),
    [quotes],
  );

  return (
    <AppShell
      title="Market Overview"
      subtitle={
        mode === "LIVE"
          ? "Dhan live quote snapshot · read-only"
          : "No verified Dhan quote snapshot available · synthetic fallback disabled"
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant={mode === "LIVE" ? "default" : "outline"}>
          {mode === "LIVE" ? (
            <>
              <Wifi className="mr-1 size-3" /> DHAN LIVE
            </>
          ) : (
            <>
              <WifiOff className="mr-1 size-3" /> DATA UNAVAILABLE
            </>
          )}
        </Badge>
        {asOf ? (
          <span className="num text-xs text-muted-foreground">
            Latest provider trade {new Date(asOf).toLocaleTimeString()}
          </span>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          <RefreshCw className={`mr-1.5 size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      {error ? (
        <div className="mb-3 rounded-lg border border-warn/40 bg-warn-muted p-3 text-xs text-warn">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {indices.map((i) => (
          <div key={i.symbol} className="panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="label-caps">{i.name}</div>
                <div className="num text-2xl font-semibold">{formatPrice(i.ltp)}</div>
                <div className={`num text-sm ${tone(i.change)}`}>
                  {formatPrice(i.change)} ({formatPct(i.changePct)})
                </div>
              </div>
              <Badge variant="outline">{i.bias}</Badge>
            </div>
            <div className="mt-3 num text-xs text-muted-foreground">
              Day {formatPrice(i.dayLow)} – {formatPrice(i.dayHigh)} · prev close{" "}
              {formatPrice(i.prevClose)}
            </div>
          </div>
        ))}
        {!indices.length ? (
          <div className="panel p-4 text-xs text-muted-foreground">
            No fresh Dhan index quotes available.
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <h2 className="text-sm font-semibold text-bull">Top gainers</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {gainers.map((q) => (
              <li key={q.symbol} className="flex justify-between">
                <span>{q.symbol}</span>
                <span className={`num ${tone(q.change)}`}>{formatPct(q.changePct)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-4">
          <h2 className="text-sm font-semibold text-bear">Top losers</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {losers.map((q) => (
              <li key={q.symbol} className="flex justify-between">
                <span>{q.symbol}</span>
                <span className={`num ${tone(q.change)}`}>{formatPct(q.changePct)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel mt-3 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">LTP</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Day low</TableHead>
              <TableHead className="text-right">Day high</TableHead>
              <TableHead className="text-right">Volume</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((q) => (
              <TableRow key={q.symbol}>
                <TableCell>
                  <div className="font-medium">{q.symbol}</div>
                  <div className="text-xs text-muted-foreground">{q.name}</div>
                </TableCell>
                <TableCell className="num text-right">{formatPrice(q.ltp)}</TableCell>
                <TableCell className={`num text-right ${tone(q.change)}`}>
                  {formatPrice(q.change)}
                </TableCell>
                <TableCell className={`num text-right ${tone(q.change)}`}>
                  {formatPct(q.changePct)}
                </TableCell>
                <TableCell className="num text-right">{formatPrice(q.dayLow)}</TableCell>
                <TableCell className="num text-right">{formatPrice(q.dayHigh)}</TableCell>
                <TableCell className="num text-right">{formatCompact(q.volume)}</TableCell>
              </TableRow>
            ))}
            {!quotes.length ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No verified Dhan quotes. Synthetic prices are not displayed.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
