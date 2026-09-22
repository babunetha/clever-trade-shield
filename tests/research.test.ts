import { describe, expect, test } from "bun:test";
import { buildDailyHistory } from "../src/lib/scanner/series";
import { backtestTrendBreakout, walkForwardTrendBreakout } from "../src/lib/research/backtest";

describe("research anti-look-ahead controls", () => {
  test("entries occur only after the signal bar closes", () => {
    const bars = buildDailyHistory("RELIANCE", 42, 300);
    const result = backtestTrendBreakout(bars);
    for (const trade of result.tradeDetails ?? []) {
      expect(trade.entryBar).toBe(trade.signalBar + 1);
      expect(trade.entryBar).toBeGreaterThan(trade.signalBar);
    }
  });

  test("walk-forward OOS results are aggregated from independent test windows", () => {
    const bars = buildDailyHistory("RELIANCE", 42, 300);
    const result = walkForwardTrendBreakout(bars, { trainBars: 160, testBars: 40 });
    expect(result.windows.length).toBeGreaterThan(0);
    for (const window of result.windows) {
      for (const trade of window.test.tradeDetails ?? []) {
        expect(trade.signalBar).toBeGreaterThanOrEqual(window.testStart);
        expect(trade.exitBar).toBeLessThan(window.testEnd);
      }
    }
  });
});
