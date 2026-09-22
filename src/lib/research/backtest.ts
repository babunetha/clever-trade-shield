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
  profitFactor: number;
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
    profitFactor: grossLoss ? round(grossWin / grossLoss, 2) : grossWin ? 99 : 0,
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

    // Critical anti-look-ahead rule:
    // the signal is known only after signalBar.close; execution starts on the next bar.
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

      // If price gaps through a level, a marketable stop/target fills at the open,
      // not at the requested level. When both intrabar levels are touched, STOP wins
      // as the conservative assumption because daily OHLC cannot reveal the path.
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
  /** Aggregated trades from each independent OOS window. No test slices are re-concatenated. */
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
    // Indicators use all bars before each OOS signal, but only signals/exits inside this
    // window are counted. This preserves warm-up history without leaking future test data.
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

export function researchScore(result: BacktestResult): number {
  if (!result.trades) return 0;
  const expectancy = Math.max(-1, Math.min(1, result.expectancyR));
  const dd = Math.min(30, result.maxDrawdownR * 1.5);
  const confidence = Math.min(20, result.trades * 1.5);
  const win = Math.max(0, Math.min(30, (result.winRate - 40) * 0.75));
  const pf = Math.max(0, Math.min(25, (result.profitFactor - 1) * 12.5));
  return Math.max(0, Math.min(100, Number((50 + expectancy * 20 + win + pf + confidence - dd).toFixed(1))));
}
