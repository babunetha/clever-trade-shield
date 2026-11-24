import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/trading/AppShell";
import { getDhanMarketSnapshot } from "@/lib/market.functions";
import { useQuery } from "@tanstack/react-query";
import { quoteHealth } from "@/lib/scanner/quote-health";
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
        content: "Read-only Dhan quotes with exchange timestamps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content: "Dhan market data with quote availability and age.",
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
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const feed = useQuery({
    queryKey: ["dhan-market-overview"],
    queryFn: async () => {
      const result = await getDhanMarketSnapshot({ data: { symbols: WATCHLIST } });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 5000,
    retry: false,
  });
  const data = feed.isError ? undefined : feed.data;
  const { quotes, indices, unavailable } = useMemo(() => {
    const rows = Object.values(data?.quotes ?? {});
    const health = (row: (typeof rows)[number]) =>
      quoteHealth(row.ltp, row.sourceTimestamp ?? "", now);
    const fresh = rows.filter((row) => health(row).fresh);
    return {
      quotes: fresh.filter((row) => row.exchangeSegment === "NSE_EQ"),
      indices: fresh
        .filter((row) => row.exchangeSegment === "IDX_I")
        .map((row) => ({
          ...row,
          bias: row.changePct > 0.25 ? "BULLISH" : row.changePct < -0.25 ? "BEARISH" : "NEUTRAL",
        })),
      unavailable: WATCHLIST.filter((symbol) => !fresh.some((row) => row.symbol === symbol)).map(
        (symbol) => {
          const row = data?.quotes[symbol];
          const age = row ? health(row).ageSeconds : Infinity;
          return (
            symbol + " (" + (Number.isFinite(age) ? Math.floor(age) + "s" : "age unknown") + ")"
          );
        },
      ),
    };
  }, [data, now]);
  const hasQuotes = quotes.length + indices.length > 0;
  const error = feed.isError
    ? feed.error.message
    : data && unavailable.length
      ? "NOT_AVAILABLE · Missing, invalid or stale quotes: " + unavailable.join(", ")
      : null;

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
      subtitle="Read-only Dhan quotes verified against exchange timestamps"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant={hasQuotes ? "default" : "outline"}>
          {hasQuotes ? (
            <>
              <Wifi className="mr-1 size-3" /> DHAN LIVE
            </>
          ) : (
            <>
              <WifiOff className="mr-1 size-3" /> {feed.isPending ? "Connecting…" : "NOT_AVAILABLE"}
            </>
          )}
        </Badge>
        {data?.asOf ? (
          <span className="num text-xs text-muted-foreground">
            Fetched {new Date(data.asOf).toLocaleTimeString()}
          </span>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => void feed.refetch()}
          disabled={feed.isFetching}
        >
          <RefreshCw className={`mr-1.5 size-3.5 ${feed.isFetching ? "animate-spin" : ""}`} />{" "}
          Refresh
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
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
