import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/trading/AppShell";
import { useTrading } from "@/lib/trading/store";
import { formatCompact, formatPct, formatPrice, tone } from "@/lib/trading/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/market")({
  head: () => ({
    meta: [
      { title: "Market Overview — ₹1L Trading Assistant" },
      {
        name: "description",
        content: "Simulated Nifty and Bank Nifty bias plus a watchlist of large-cap Indian equities with day ranges.",
      },
      { property: "og:title", content: "Market Overview — ₹1L Trading Assistant" },
      {
        property: "og:description",
        content: "Index bias and an intraday equity watchlist built on clearly labelled simulated data.",
      },
    ],
  }),
  component: MarketOverview,
});

function MarketOverview() {
  const { quotes, indices } = useTrading();
  const gainers = [...quotes].sort((a, b) => b.changePct - a.changePct).slice(0, 3);
  const losers = [...quotes].sort((a, b) => a.changePct - b.changePct).slice(0, 3);

  return (
    <AppShell title="Market Overview" subtitle="Simulated index bias and equity watchlist — no broker feed connected.">
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
              Day {formatPrice(i.dayLow)} – {formatPrice(i.dayHigh)} · prev close {formatPrice(i.prevClose)}
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
                <TableCell className={`num text-right ${tone(q.change)}`}>{formatPrice(q.change)}</TableCell>
                <TableCell className={`num text-right ${tone(q.change)}`}>{formatPct(q.changePct)}</TableCell>
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
