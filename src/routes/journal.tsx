import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/trading/AppShell";
import { useTrading } from "@/lib/trading/store";
import { formatDateTime, formatINR, formatPrice, formatSignedINR, tone } from "@/lib/trading/format";
import { Badge } from "@/components/ui/badge";
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

  const closed = trades.filter((t) => t.status === "CLOSED");
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const avgR = closed.length
    ? Number((closed.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / closed.length).toFixed(2))
    : 0;

  return (
    <AppShell title="Trade Journal" subtitle="Every entry here is a simulated fill — no broker order was placed.">
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
          const live = quotes.find((q) => q.symbol === t.symbol)?.ltp ?? t.entry;
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
