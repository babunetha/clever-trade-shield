import type { DailyBar } from "@/lib/scanner/series";
import { atr, ema, rsi, rvol } from "@/lib/scanner/series";

export interface BacktestConfig {
  riskPerTrade?: number;
  stopAtr?: number;
  targetR?: number;
  maxHoldBars?: number;
  minRsi?: number;
  maxRsi?: number;
  minRvol?: number;
}

export interface BacktestTrade {
  entryBar: number;
  exitBar: number;
  entry: number;
  exit: number;
  rMultiple: number;
  reason: "TARGET" | "STOP" | "TIME";
}

export interface BacktestResult {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancyR: number;
  profitFactor: number;
  maxDrawdownR: number;
  totalR: number;
  avgHoldBars: number;
}

/**
 * Small, deterministic, look-ahead-safe research engine.
 * It is deliberately dependency-free so the web app stays fast and cheap.
 * Entry decisions use only bars at or before the entry bar; exits are simulated
 * from subsequent bars. This is research evidence, not a performance guarantee.
 */
export function backtestTrendBreakout(
  bars: DailyBar[],
  config: BacktestConfig = {},
): BacktestResult {
  const stopAtr = config.stopAtr ?? 1.2;
  const targetR = config.targetR ?? 1.5;
  const maxHoldBars = config.maxHoldBars ?? 10;
  const minRsi = config.minRsi ?? 45;
  const maxRsi = config.maxRsi ?? 75;
  const minRvol = config.minRvol ?? 1.2;

  const trades: BacktestTrade[] = [];
  let i = 30;

  while (i < bars.length - 1) {
    const history = bars.slice(0, i + 1);
    const closes = history.map((b) => b.close);
    const e10 = ema(closes, 10);
    const e30 = ema(closes, 30);
    const r = rsi(closes, 14);
    const rv = rvol(history);
    const a = atr(history, 14);
    const prev = bars[i - 1]!;
    const bar = bars[i]!;

    const signal =
      e10 !== null &&
      e30 !== null &&
      e10 > e30 &&
      r !== null &&
      r >= minRsi &&
      r <= maxRsi &&
      rv !== null &&
      rv >= minRvol &&
      a !== null &&
      bar.close > prev.close;

    if (!signal || a === null) {
      i++;
      continue;
    }

    const entry = bar.close;
    const risk = Math.max(0.05, a * stopAtr);
    const stop = entry - risk;
    const target = entry + risk * targetR;

    let exitBar = Math.min(i + maxHoldBars, bars.length - 1);
    let exit = bars[exitBar]!.close;
    let reason: BacktestTrade["reason"] = "TIME";

    for (let j = i + 1; j <= exitBar; j++) {
      const next = bars[j]!;
      // Conservative ordering: if both levels are touched in one candle,
      // count the stop first rather than granting an optimistic fill.
      if (next.low <= stop) {
        exitBar = j;
        exit = stop;
        reason = "STOP";
        break;
      }
      if (next.high >= target) {
        exitBar = j;
        exit = target;
        reason = "TARGET";
        break;
      }
    }

    trades.push({
      entryBar: i,
      exitBar,
      entry: Number(entry.toFixed(2)),
      exit: Number(exit.toFixed(2)),
      rMultiple: Number(((exit - entry) / risk).toFixed(3)),
      reason,
    });

    i = exitBar + 1;
  }

  const totalR = trades.reduce((s, t) => s + t.rMultiple, 0);
  const wins = trades.filter((t) => t.rMultiple > 0).length;
  const losses = trades.filter((t) => t.rMultiple < 0).length;
  const grossWin = trades.filter((t) => t.rMultiple > 0).reduce((s, t) => s + t.rMultiple, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.rMultiple < 0).reduce((s, t) => s + t.rMultiple, 0));

  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  for (const t of trades) {
    equity += t.rMultiple;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
  }

  return {
    trades: trades.length,
    wins,
    losses,
    winRate: trades.length ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
    expectancyR: trades.length ? Number((totalR / trades.length).toFixed(3)) : 0,
    profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99 : 0,
    maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
    totalR: Number(totalR.toFixed(2)),
    avgHoldBars: trades.length
      ? Number((trades.reduce((s, t) => s + (t.exitBar - t.entryBar), 0) / trades.length).toFixed(1))
      : 0,
  };
}

export function researchScore(result: BacktestResult): number {
  if (!result.trades) return 0;
  const expectancy = Math.max(-1, Math.min(1, result.expectancyR));
  const drawdownPenalty = Math.min(30, result.maxDrawdownR * 1.5);
  const tradeConfidence = Math.min(20, result.trades * 1.5);
  const winComponent = Math.max(0, Math.min(30, (result.winRate - 40) * 0.75));
  const pfComponent = Math.max(0, Math.min(25, (result.profitFactor - 1) * 12.5));
  return Math.max(
    0,
    Math.min(100, Number((50 + expectancy * 20 + winComponent + pfComponent + tradeConfidence - drawdownPenalty).toFixed(1))),
  );
}
