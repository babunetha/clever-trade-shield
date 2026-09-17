/**
 * Chartink scanner concepts, expressed as configurable criteria.
 *
 * Chartink is treated ONLY as a candidate source. Nothing here decides a trade:
 * every candidate must clear the second-stage verification in ./verify.ts and
 * the existing risk engine before a paper trade can be logged.
 *
 * No accuracy claim from any scanner's marketing copy is reproduced anywhere.
 */

export type ScannerId = "BEST_BUY_INTRADAY" | "UP20_1M_30_3M" | "STRONG_STOCKS" | "UP20_TIGHTNESS" | "POSSIBLE_BREAKOUT";

export interface ScannerCriterion {
  key: string;
  label: string;
  /** Configurable numeric threshold used by the candidate filter. */
  value: number;
  unit: "%" | "x" | "₹" | "sessions" | "shares" | "₹Cr";
  hint: string;
}

export interface ScannerDefinition {
  id: ScannerId;
  name: string;
  summary: string;
  /** What the scanner cannot know — shown in the UI next to every candidate. */
  caveat: string;
  criteria: ScannerCriterion[];
}

export const SCANNERS: ScannerDefinition[] = [
  {
    id: "BEST_BUY_INTRADAY",
    name: "Best Buy Stocks for Intraday",
    summary:
      "Multi-day daily range expansion with close above open, recent closes stronger than prior closes, a volume floor and a stacked moving-average trend (SMA20 > SMA50 > SMA200).",
    caveat:
      "Range expansion is a daily-timeframe read. It says nothing about today's intraday structure, so entry timing is decided by our verification layer, not by the scan.",
    criteria: [
      { key: "expansionDays", label: "Range-expansion sessions", value: 3, unit: "sessions", hint: "Each session's range wider than the previous one." },
      { key: "strongCloses", label: "Stronger closes required", value: 2, unit: "sessions", hint: "Close above the prior close for this many sessions." },
      { key: "minVolume", label: "Minimum daily volume", value: 500000, unit: "shares", hint: "Liquidity floor so exits are realistic." },
      { key: "smaStack", label: "SMA stack required", value: 1, unit: "x", hint: "1 = require SMA20 > SMA50 > SMA200." },
    ],
  },
  {
    id: "UP20_1M_30_3M",
    name: "20% up in 1 month & 30% up in 3 months",
    summary:
      "Price appreciation over roughly 22 and 66 trading sessions, filtered for liquidity and traded value so the move is tradeable rather than a thin-stock artefact.",
    caveat:
      "A stock that has already run 30% is extended. Chasing it without a defined stop is the main failure mode; verification enforces reward-to-risk.",
    criteria: [
      { key: "return22", label: "Return over 22 sessions", value: 20, unit: "%", hint: "~1 month of trading sessions." },
      { key: "return66", label: "Return over 66 sessions", value: 30, unit: "%", hint: "~3 months of trading sessions." },
      { key: "minTradedValue", label: "Minimum daily traded value", value: 10, unit: "₹Cr", hint: "Price x volume, in crore rupees." },
    ],
  },
  {
    id: "STRONG_STOCKS",
    name: "Strong Stocks",
    summary: "Consecutive daily closes above the prior close — simple persistence of demand over roughly five sessions.",
    caveat:
      "Consecutive up-closes also mark short-term exhaustion. Treated as strength evidence only, never as an entry trigger on its own.",
    criteria: [
      { key: "streak", label: "Consecutive higher closes", value: 5, unit: "sessions", hint: "Each close above the prior close." },
      { key: "minTradedValue", label: "Minimum daily traded value", value: 5, unit: "₹Cr", hint: "Liquidity floor." },
    ],
  },
  {
    id: "UP20_TIGHTNESS",
    name: "UP20% + IN30DAYS + TIGHTNESS",
    summary:
      "Roughly 20% appreciation over ~22 sessions, then a contraction phase. Tightness is exposed as a configurable criterion instead of a fixed heuristic.",
    caveat:
      "Tightness definitions vary widely and the screenshot's version is one choice among many. Tune the contraction threshold here and judge it against our own backtest, not the source's claim.",
    criteria: [
      { key: "return22", label: "Return over 22 sessions", value: 20, unit: "%", hint: "~1 month of trading sessions." },
      { key: "tightness", label: "Max recent range as % of price", value: 4, unit: "%", hint: "Average of the last 5 daily ranges divided by price." },
      { key: "minPrice", label: "Minimum price", value: 50, unit: "₹", hint: "Avoids penny-stock behaviour." },
      { key: "minTradedValue", label: "Minimum daily traded value", value: 5, unit: "₹Cr", hint: "Liquidity floor." },
    ],
  },
  {
    id: "POSSIBLE_BREAKOUT",
    name: "Possible Breakout",
    summary:
      "Price sitting between 90% and 95% of the 52-week high in the ₹100-₹1000 band. Volume and breakout confirmation are added by our verification layer, not assumed.",
    caveat:
      "Proximity to a 52-week high is not a breakout. Without a completed candle closing above the pivot on expanding volume, this is a watchlist item only.",
    criteria: [
      { key: "minPctOf52w", label: "Minimum % of 52-week high", value: 90, unit: "%", hint: "Lower edge of the coil zone." },
      { key: "maxPctOf52w", label: "Maximum % of 52-week high", value: 95, unit: "%", hint: "Above this the move has already started." },
      { key: "minPrice", label: "Minimum price", value: 100, unit: "₹", hint: "From the source scan." },
      { key: "maxPrice", label: "Maximum price", value: 1000, unit: "₹", hint: "From the source scan." },
    ],
  },
];

export const scannerById = (id: ScannerId) => SCANNERS.find((s) => s.id === id)!;

export type ScannerConfig = Record<ScannerId, { enabled: boolean; criteria: Record<string, number> }>;

export function defaultScannerConfig(): ScannerConfig {
  return Object.fromEntries(
    SCANNERS.map((s) => [s.id, { enabled: true, criteria: Object.fromEntries(s.criteria.map((c) => [c.key, c.value])) }]),
  ) as ScannerConfig;
}
