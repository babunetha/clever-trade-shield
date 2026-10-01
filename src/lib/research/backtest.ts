import type { DailyBar } from "@/lib/scanner/series";
import { atr, ema, rsi, rvol } from "@/lib/scanner/series";

export interface BacktestConfig {
  stopAtr?: number;
  targetR?: number;
  maxHoldBars?: number;
  minRsi?: number;
  maxRsi?: number;
  minRvol?: number;
  slippageBps?: number;
  feeBpsPerSide?: number;
  stampDutyBpsPerSide?: number;
}

export interface BacktestTrade {
  /** Signal is generated from the close of this bar. */
  signalBar: number;
  /** Entry occurs at the next bar's open (never the signal bar's close). */
  entryBar: number;
  exitBar: number;
  entry: number;
  exit: number;
  grossR: number;
  netR: number;
  costsR: number;
  rMultiple: number;
  reason: "TARGET" | "STOP" | "TIME";
}

export interface BacktestResult {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancyR: number;
  grossExpectancyR: number;
  /** Null when there are no losing trades, because a finite profit factor is undefined. */
  profitFactor: number | null;
  maxDrawdownR: number;
  totalR: number;
  grossTotalR: number;
  totalCostsR: number;
  avgHoldBars: number;
  tradeDetails?: BacktestTrade[];
}

const round = (n: number, d = 3) => Number(n.toFixed(d));

function summarize(trades: BacktestTrade[], includeDetails = false): BacktestResult {
  const totalR = trades.reduce((s, t) => s + t.netR, 0);
  const grossTotalR = trades.reduce((s, t) => s + t.grossR, 0);
  const totalCostsR = trades.reduce((s, t) => s + t.costsR, 0);
  const wins = trades.filter((t) => t.netR > 0).length;
  const losses = trades.filter((t) => t.netR < 0).length;
  const grossWin = trades.filter((t) => t.netR > 0).reduce((s, t) => s + t.netR, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.netR < 0).reduce((s, t) => s + t.netR, 0));
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;

  for (const trade of trades) {
    equity += trade.netR;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
  }

  return {
    trades: trades.length,
    wins,
    losses,
    winRate: trades.length ? round((wins / trades.length) * 100, 1) : 0,
    expectancyR: trades.length ? round(totalR / trades.length) : 0,
    grossExpectancyR: trades.length ? round(grossTotalR / trades.length) : 0,
    profitFactor: grossLoss ? round(grossWin / grossLoss, 2) : null,
    maxDrawdownR: round(maxDrawdownR, 2),
    totalR: round(totalR, 2),
    grossTotalR: round(grossTotalR, 2),
    totalCostsR: round(totalCostsR, 2),
    avgHoldBars: trades.length
      ? round(trades.reduce((s, t) => s + t.exitBar - t.entryBar, 0) / trades.length, 1)
      : 0,
    ...(includeDetails ? { tradeDetails: trades } : {}),
  };
}

function runBacktest(
  bars: DailyBar[],
  config: BacktestConfig,
  evaluationStart: number,
  evaluationEnd: number,
): BacktestTrade[] {
  const stopAtr = config.stopAtr ?? 1.2;
  const targetR = config.targetR ?? 1.5;
  const maxHoldBars = config.maxHoldBars ?? 10;
  const minRsi = config.minRsi ?? 45;
  const maxRsi = config.maxRsi ?? 75;
  const minRvol = config.minRvol ?? 1.2;
  const slippage = (config.slippageBps ?? 5) / 10000;
  const fee = (config.feeBpsPerSide ?? 3) / 10000;
  const stamp = (config.stampDutyBpsPerSide ?? 0) / 10000;
  const trades: BacktestTrade[] = [];
  const lastSignalBar = Math.min(evaluationEnd - 2, bars.length - 2);

  for (let i = Math.max(30, evaluationStart); i <= lastSignalBar; ) {
    const history = bars.slice(0, i + 1);
    const closes = history.map((b) => b.close);
    const e10 = ema(closes, 10);
    const e30 = ema(closes, 30);
    const r = rsi(closes, 14);
    const rv = rvol(history);
    const a = atr(history, 14);
    const prev = bars[i - 1]!;
    const signalBar = bars[i]!;

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
      signalBar.close > prev.close;

    if (!signal || a === null) {
      i++;
      continue;
    }

    const entryBar = i + 1;
    const rawEntry = bars[entryBar]!.open;
    const risk = Math.max(0.05, a * stopAtr);
    const stop = rawEntry - risk;
    const target = rawEntry + risk * targetR;
    const entry = rawEntry * (1 + slippage + fee);

    const exitLimit = Math.min(entryBar + maxHoldBars - 1, evaluationEnd - 1, bars.length - 1);
    let exitBar = exitLimit;
    let rawExit = bars[exitLimit]!.close;
    let reason: BacktestTrade["reason"] = "TIME";

    for (let j = entryBar; j <= exitLimit; j++) {
      const next = bars[j]!;
      const gapOpen = next.open;

      if (gapOpen <= stop) {
        exitBar = j;
        rawExit = gapOpen;
        reason = "STOP";
        break;
      }
      if (gapOpen >= target) {
        exitBar = j;
        rawExit = gapOpen;
        reason = "TARGET";
        break;
      }
      if (next.low <= stop) {
        exitBar = j;
        rawExit = stop;
        reason = "STOP";
        break;
      }
      if (next.high >= target) {
        exitBar = j;
        rawExit = target;
        reason = "TARGET";
        break;
      }
    }

    const exit = rawExit * (1 - slippage - fee - stamp);
    const grossR = (rawExit - rawEntry) / risk;
    const netR = (exit - entry) / risk;

    trades.push({
      signalBar: i,
      entryBar,
      exitBar,
      entry: round(entry, 2),
      exit: round(exit, 2),
      grossR: round(grossR),
      netR: round(netR),
      costsR: round(grossR - netR),
      rMultiple: round(netR),
      reason,
    });

    i = exitBar + 1;
  }

  return trades;
}

export function backtestTrendBreakout(
  bars: DailyBar[],
  config: BacktestConfig = {},
): BacktestResult {
  if (bars.length < 32) return summarize([]);
  return summarize(runBacktest(bars, config, 30, bars.length), true);
}

export interface WalkForwardResult {
  windows: Array<{
    train: BacktestResult;
    test: BacktestResult;
    trainEnd: number;
    testStart: number;
    testEnd: number;
  }>;
  outOfSample: BacktestResult;
  stability: {
    profitableWindows: number;
    totalWindows: number;
    profitableRate: number;
  };
}

export function walkForwardTrendBreakout(
  bars: DailyBar[],
  options: {
    trainBars?: number;
    testBars?: number;
    stepBars?: number;
    config?: BacktestConfig;
  } = {},
): WalkForwardResult {
  const trainBars = options.trainBars ?? 160;
  const testBars = options.testBars ?? 40;
  const stepBars = options.stepBars ?? testBars;
  const windows: WalkForwardResult["windows"] = [];
  const allOosTrades: BacktestTrade[] = [];

  for (let trainEnd = trainBars; trainEnd + testBars <= bars.length; trainEnd += stepBars) {
    const testEnd = trainEnd + testBars;
    const trainTrades = runBacktest(bars, options.config ?? {}, 30, trainEnd);
    const testTrades = runBacktest(bars, options.config ?? {}, trainEnd, testEnd);
    const train = summarize(trainTrades);
    const test = summarize(testTrades);
    windows.push({
      train,
      test,
      trainEnd,
      testStart: trainEnd,
      testEnd,
    });
    allOosTrades.push(...testTrades);
  }

  const outOfSample = summarize(allOosTrades, true);
  const profitableWindows = windows.filter((w) => w.test.totalR > 0).length;

  return {
    windows,
    outOfSample,
    stability: {
      profitableWindows,
      totalWindows: windows.length,
      profitableRate: windows.length ? round((profitableWindows / windows.length) * 100, 1) : 0,
    },
  };
}

/**
 * Transparent derived research score. It is not a model confidence value and must
 * never be displayed as a probability of future success. Every component comes
 * directly from the measured backtest result; an undefined profit factor contributes
 * zero rather than receiving a fabricated sentinel value.
 */
export function researchScore(result: BacktestResult): number {
  if (!result.trades) return 0;
  const expectancyComponent = Math.max(0, Math.min(25, ((result.expectancyR + 1) / 2) * 25));
  const winRateComponent = Math.max(0, Math.min(20, result.winRate * 0.2));
  const profitFactorComponent =
    result.profitFactor === null ? 0 : Math.max(0, Math.min(25, (result.profitFactor / 3) * 25));
  const drawdownComponent = Math.max(0, Math.min(15, 15 / (1 + result.maxDrawdownR)));
  const sampleComponent = Math.min(15, result.trades * 0.5);
  return round(
    Math.max(
      0,
      Math.min(
        100,
        expectancyComponent +
          winRateComponent +
          profitFactorComponent +
          drawdownComponent +
          sampleComponent,
      ),
    ),
    1,
  );
}
