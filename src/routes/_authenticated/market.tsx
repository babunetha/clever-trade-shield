import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/trading/AppShell";
import { useTrading } from "@/lib/trading/store";
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



function MarketOverview() {
  const {
    quotes,
    indices,
    marketDataStatus,
    marketDataAsOf,
    marketDataError,
    refreshMarketSnapshot,
  } = useTrading();
  const [refreshing, setRefreshing] = useState(false);
  const mode = marketDataStatus === "FRESH" ? "LIVE" : "UNAVAILABLE";

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshMarketSnapshot();
    } finally {
      setRefreshing(false);
    }
  }, [refreshMarketSnapshot]);

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
          : marketDataStatus === "CONNECTING"\n            ? "Checking Dhan provider timestamps…"\n            : "No verified Dhan quote snapshot available · synthetic fallback disabled"
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
              <WifiOff className="mr-1 size-3" /> {marketDataStatus === "CONNECTING" ? "CHECKING…" : "DATA UNAVAILABLE"}
            </>
          )}
        </Badge>
        {marketDataAsOf ? (
          <span className="num text-xs text-muted-foreground">
            Latest provider trade {new Date(marketDataAsOf).toLocaleTimeString()}
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
      {marketDataError ? (
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
