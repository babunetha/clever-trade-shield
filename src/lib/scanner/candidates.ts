import type { ScannerConfig, ScannerId } from "./definitions";
import { SCANNERS } from "./definitions";
import {
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
import { UNIVERSE } from "@/lib/trading/mock";

export interface ScanCandidate {
  id: string;
  scannerId: ScannerId;
  scannerName: string;
  symbol: string;
  name: string;
  /** Last completed daily close from the scan source. */
  scanClose: number;
  matched: string[];
  scannedAt: string;
  bars: DailyBar[];
}

const crit = (config: ScannerConfig, id: ScannerId, key: string, fallback: number) =>
  config[id]?.criteria[key] ?? fallback;

/**
 * Runs every enabled scanner over the simulated daily history.
 * Criteria are evaluated for real; nothing is hard-coded as a match.
 */
export function runScanners(config: ScannerConfig, seed: number): ScanCandidate[] {
  const scannedAt = new Date().toISOString();
  const histories = new Map<string, DailyBar[]>(
    UNIVERSE.map((u) => [u.symbol, buildDailyHistory(u.symbol, seed)]),
  );
  const out: ScanCandidate[] = [];

  for (const def of SCANNERS) {
    if (!config[def.id]?.enabled) continue;

    for (const u of UNIVERSE) {
      const bars = histories.get(u.symbol)!;
      const c = closes(bars);
      const last = bars.at(-1)!;
      const matched: string[] = [];
      let pass = false;

      if (def.id === "BEST_BUY_INTRADAY") {
        const expansion = rangeExpansionDays(bars);
        const streak = higherCloseStreak(bars);
        const s20 = sma(c, 20);
        const s50 = sma(c, 50);
        const s200 = sma(c, 200);
        const stackNeeded = crit(config, def.id, "smaStack", 1) >= 1;
        const stacked = s20 !== null && s50 !== null && s200 !== null && s20 > s50 && s50 > s200;
        pass =
          expansion >= crit(config, def.id, "expansionDays", 3) &&
          streak >= crit(config, def.id, "strongCloses", 2) &&
          last.close > last.open &&
          last.volume >= crit(config, def.id, "minVolume", 500000) &&
          (!stackNeeded || stacked);
        if (pass)
          matched.push(
            `${expansion} sessions of range expansion`,
            `${streak} consecutive stronger closes`,
            `Close ${last.close} above open ${last.open}`,
            stacked ? "SMA20 > SMA50 > SMA200" : "SMA stack not required by config",
          );
      }

      if (def.id === "UP20_1M_30_3M") {
        const r22 = returnOver(bars, 22);
        const r66 = returnOver(bars, 66);
        const tv = tradedValueCr(bars);
        pass =
          r22 !== null &&
          r66 !== null &&
          r22 >= crit(config, def.id, "return22", 20) &&
          r66 >= crit(config, def.id, "return66", 30) &&
          tv >= crit(config, def.id, "minTradedValue", 10);
        if (pass) matched.push(`22-session return ${r22}%`, `66-session return ${r66}%`, `Traded value ₹${tv} Cr`);
      }

      if (def.id === "STRONG_STOCKS") {
        const streak = higherCloseStreak(bars);
        const tv = tradedValueCr(bars);
        pass = streak >= crit(config, def.id, "streak", 5) && tv >= crit(config, def.id, "minTradedValue", 5);
        if (pass) matched.push(`${streak} consecutive higher closes`, `Traded value ₹${tv} Cr`);
      }

      if (def.id === "UP20_TIGHTNESS") {
        const r22 = returnOver(bars, 22);
        const tight = tightnessPct(bars);
        const tv = tradedValueCr(bars);
        pass =
          r22 !== null &&
          tight !== null &&
          r22 >= crit(config, def.id, "return22", 20) &&
          tight <= crit(config, def.id, "tightness", 4) &&
          last.close >= crit(config, def.id, "minPrice", 50) &&
          tv >= crit(config, def.id, "minTradedValue", 5);
        if (pass) matched.push(`22-session return ${r22}%`, `Tightness ${tight}% of price`, `Traded value ₹${tv} Cr`);
      }

      if (def.id === "POSSIBLE_BREAKOUT") {
        const h52 = high52w(bars);
        const pct = h52 ? Number(((last.close / h52) * 100).toFixed(2)) : 0;
        pass =
          pct >= crit(config, def.id, "minPctOf52w", 90) &&
          pct <= crit(config, def.id, "maxPctOf52w", 95) &&
          last.close >= crit(config, def.id, "minPrice", 100) &&
          last.close <= crit(config, def.id, "maxPrice", 1000);
        if (pass) matched.push(`At ${pct}% of the 52-week high ${h52}`, `Price ${last.close} inside the configured band`);
      }

      if (pass)
        out.push({
          id: `${def.id}-${u.symbol}`,
          scannerId: def.id,
          scannerName: def.name,
          symbol: u.symbol,
          name: u.name,
          scanClose: last.close,
          matched,
          scannedAt,
          bars,
        });
    }
  }

  return out;
}
