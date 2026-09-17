/**
 * Standardised backtest for the scanner concepts.
 *
 * IMPORTANT: any accuracy or win-rate figure advertised by a public scanner is
 * NOT reproduced here. The only numbers shown in the UI are the ones this
 * function computes, on our own simulated history, with our own rules:
 *   - entry at the next session's open after a scan match
 *   - stop at 1.2 x ATR(14), target 1 at 1.5R, time stop after 5 sessions
 *   - brokerage/taxes and slippage deducted from every trade
 * Results are therefore a property of THIS model, not evidence about the market.
 */

import type { ScannerConfig, ScannerId } from "./definitions";
import { SCANNERS } from "./definitions";
import { UNIVERSE } from "@/lib/trading/mock";
import {
  atr,
  buildDailyHistory,
  closes,
  higherCloseStreak,
  high52w,
  rangeExpansionDays,
  returnOver,
  sma,
  tightnessPct,
  tradedValueCr,
  type DailyBar,
} from "./series";

export interface BacktestMetrics {
  scannerId: ScannerId;
  trades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdown: number;
  netPnl: number;
  costsPaid: number;
  slippagePaid: number;
  sessions: number;
}

export interface BacktestAssumptions {
  costPerTradePct: number;
  slippagePerSidePct: number;
  riskPerTrade: number;
  atrStopMultiple: number;
  targetR: number;
  timeStopSessions: number;
}

export const BACKTEST_ASSUMPTIONS: BacktestAssumptions = {
  costPerTradePct: 0.06,
  slippagePerSidePct: 0.05,
  riskPerTrade: 500,
  atrStopMultiple: 1.2,
  targetR: 1.5,
  timeStopSessions: 5,
};

const round = (v: number, dp = 2) => Number(v.toFixed(dp));

function matches(scannerId: ScannerId, bars: DailyBar[], upto: number, config: ScannerConfig): boolean {
  const slice = bars.slice(0, upto + 1);
  if (slice.length < 210) return false;
  const c = closes(slice);
  const last = slice.at(-1)!;
  const crit = (k: string, d: number) => config[scannerId]?.criteria[k] ?? d;

  switch (scannerId) {
    case "BEST_BUY_INTRADAY": {
      const s20 = sma(c, 20);
      const s50 = sma(c, 50);
      const s200 = sma(c, 200);
      return (
        rangeExpansionDays(slice) >= crit("expansionDays", 3) &&
        higherCloseStreak(slice) >= crit("strongCloses", 2) &&
        last.close > last.open &&
        last.volume >= crit("minVolume", 500000) &&
        (crit("smaStack", 1) < 1 || (s20 !== null && s50 !== null && s200 !== null && s20 > s50 && s50 > s200))
      );
    }
    case "UP20_1M_30_3M": {
      const r22 = returnOver(slice, 22);
      const r66 = returnOver(slice, 66);
      return r22 !== null && r66 !== null && r22 >= crit("return22", 20) && r66 >= crit("return66", 30) && tradedValueCr(slice) >= crit("minTradedValue", 10);
    }
    case "STRONG_STOCKS":
      return higherCloseStreak(slice) >= crit("streak", 5) && tradedValueCr(slice) >= crit("minTradedValue", 5);
    case "UP20_TIGHTNESS": {
      const r22 = returnOver(slice, 22);
      const t = tightnessPct(slice);
      return r22 !== null && t !== null && r22 >= crit("return22", 20) && t <= crit("tightness", 4) && last.close >= crit("minPrice", 50);
    }
    case "POSSIBLE_BREAKOUT": {
      const pct = (last.close / high52w(slice)) * 100;
      return pct >= crit("minPctOf52w", 90) && pct <= crit("maxPctOf52w", 95) && last.close >= crit("minPrice", 100) && last.close <= crit("maxPrice", 1000);
    }
  }
}

export function backtestScanner(scannerId: ScannerId, config: ScannerConfig, seed = 20240101): BacktestMetrics {
  const a = BACKTEST_ASSUMPTIONS;
  const results: number[] = [];
  let costsPaid = 0;
  let slippagePaid = 0;
  let sessions = 0;

  for (const u of UNIVERSE) {
    const bars = buildDailyHistory(u.symbol, seed, 420);
    sessions = bars.length;
    for (let i = 210; i < bars.length - a.timeStopSessions - 1; i++) {
      if (!matches(scannerId, bars, i, config)) continue;
      const atrValue = atr(bars.slice(0, i + 1), 14);
      if (!atrValue) continue;

      const entryBar = bars[i + 1]!;
      const slip = entryBar.open * (a.slippagePerSidePct / 100);
      const entry = entryBar.open + slip;
      const stop = entry - a.atrStopMultiple * atrValue;
      const perShare = entry - stop;
      if (perShare <= 0) continue;
      const qty = Math.floor(a.riskPerTrade / perShare);
      if (qty <= 0) continue;
      const target = entry + a.targetR * perShare;

      let exit = bars[Math.min(i + 1 + a.timeStopSessions, bars.length - 1)]!.close;
      for (let j = i + 1; j <= Math.min(i + a.timeStopSessions, bars.length - 1); j++) {
        const b = bars[j]!;
        if (b.low <= stop) {
          exit = stop;
          break;
        }
        if (b.high >= target) {
          exit = target;
          break;
        }
      }
      const exitSlip = exit * (a.slippagePerSidePct / 100);
      const gross = (exit - exitSlip - entry) * qty;
      const cost = (entry + exit) * qty * (a.costPerTradePct / 100);
      costsPaid += cost;
      slippagePaid += (slip + exitSlip) * qty;
      results.push(gross - cost);
      i += a.timeStopSessions; // no overlapping trades in the same symbol
    }
  }

  const wins = results.filter((r) => r > 0);
  const losses = results.filter((r) => r <= 0);
  const grossWin = wins.reduce((s, r) => s + r, 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + r, 0));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const r of results) {
    equity += r;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }

  return {
    scannerId,
    trades: results.length,
    winRate: results.length ? round((wins.length / results.length) * 100) : 0,
    avgWin: wins.length ? round(grossWin / wins.length) : 0,
    avgLoss: losses.length ? round(-grossLoss / losses.length) : 0,
    expectancy: results.length ? round(equity / results.length) : 0,
    profitFactor: grossLoss ? round(grossWin / grossLoss) : 0,
    maxDrawdown: round(maxDrawdown),
    netPnl: round(equity),
    costsPaid: round(costsPaid),
    slippagePaid: round(slippagePaid),
    sessions,
  };
}

export const backtestAll = (config: ScannerConfig, seed = 20240101) =>
  SCANNERS.map((s) => backtestScanner(s.id, config, seed));
