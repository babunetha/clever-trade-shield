import { useMemo } from "react";
import { BACKTEST_ASSUMPTIONS, backtestScanner } from "@/lib/scanner/backtest";
import { SCANNERS, type ScannerConfig } from "@/lib/scanner/definitions";
import { formatINR } from "@/lib/trading/format";

export function BacktestPanel({ config }: { config: ScannerConfig }) {
  const results = useMemo(
    () => SCANNERS.map((s) => ({ scanner: s, m: backtestScanner(s.id, config) })),
    [config],
  );
  const a = BACKTEST_ASSUMPTIONS;
  return (
    <section className="mb-4 rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Backtest (our own standardized test)</h2>
        <span className="rounded border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
          Simulated history · not a performance promise
        </span>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Risk {formatINR(a.riskPerTrade)}/trade, stop {a.atrStopMultiple}×ATR, target {a.targetR}R, time stop {a.timeStopSessions} sessions,
        costs {a.costPerTradePct}% + slippage {a.slippagePerSidePct}%/side. Uses your current scanner criteria.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-2">Scanner</th>
              <th className="pr-2 text-right">Trades</th>
              <th className="pr-2 text-right">Win %</th>
              <th className="pr-2 text-right">Avg win</th>
              <th className="pr-2 text-right">Avg loss</th>
              <th className="pr-2 text-right">Expectancy</th>
              <th className="pr-2 text-right">PF</th>
              <th className="pr-2 text-right">Max DD</th>
              <th className="pr-2 text-right">Net</th>
              <th className="text-right">Costs+slip</th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ scanner, m }) => (
              <tr key={scanner.id} className="border-t border-border">
                <td className="py-1 pr-2">{scanner.name}</td>
                <td className="pr-2 text-right">{m.trades}</td>
                <td className="pr-2 text-right">{m.trades ? m.winRate + "%" : "—"}</td>
                <td className="pr-2 text-right">{formatINR(m.avgWin)}</td>
                <td className="pr-2 text-right">{formatINR(m.avgLoss)}</td>
                <td className={"pr-2 text-right " + (m.expectancy >= 0 ? "text-bull" : "text-bear")}>{formatINR(m.expectancy)}</td>
                <td className="pr-2 text-right">{m.profitFactor || "—"}</td>
                <td className="pr-2 text-right text-bear">{formatINR(m.maxDrawdown)}</td>
                <td className={"pr-2 text-right " + (m.netPnl >= 0 ? "text-bull" : "text-bear")}>{formatINR(m.netPnl)}</td>
                <td className="text-right">{formatINR(m.costsPaid + m.slippagePaid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {results.every((r) => r.m.trades < 30) ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Fewer than 30 trades per scanner — too small a sample to trust.</p>
      ) : null}
    </section>
  );
}
