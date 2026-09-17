import { makeRng, UNIVERSE } from "@/lib/trading/mock";

/**
 * SIMULATED daily history + the indicator maths used by the scanner layer.
 *
 * The bars are deterministic per symbol so scanner criteria are genuinely
 * evaluated rather than faked. When Dhan live data is configured, the same
 * indicator functions run over broker candles instead — the maths does not
 * change, only the source of the bars.
 */

export interface DailyBar {
  /** Session index, 0 = oldest. */
  i: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const SECTORS: Record<string, string> = {
  RELIANCE: "Energy",
  HDFCBANK: "Financials",
  INFY: "IT",
  TATAMOTORS: "Auto",
  SBIN: "Financials",
  ICICIBANK: "Financials",
  ITC: "FMCG",
  AXISBANK: "Financials",
  TATASTEEL: "Metals",
  LT: "Capital Goods",
  MARUTI: "Auto",
  BHARTIARTL: "Telecom",
};

const round = (v: number, dp = 2) => Number(v.toFixed(dp));

/** 300 sessions of seeded daily bars, ending near the symbol's base price. */
export function buildDailyHistory(symbol: string, seed: number, sessions = 300): DailyBar[] {
  const u = UNIVERSE.find((x) => x.symbol === symbol);
  const base = u?.base ?? 500;
  const rng = makeRng(seed ^ hash(symbol));
  const bars: DailyBar[] = [];
  let price = base * (0.6 + rng() * 0.25);
  let regime = (rng() - 0.4) * 0.004;

  for (let i = 0; i < sessions; i++) {
    if (i % 18 === 0) regime = (rng() - 0.42) * 0.005;
    const drift = regime + (rng() - 0.5) * 0.02;
    const open = price;
    const close = Math.max(5, open * (1 + drift));
    const wick = open * (0.004 + rng() * 0.016);
    bars.push({
      i,
      open: round(open),
      high: round(Math.max(open, close) + wick * rng()),
      low: round(Math.min(open, close) - wick * rng()),
      close: round(close),
      volume: Math.round(250_000 + rng() * 5_500_000),
    });
    price = close;
  }
  return bars;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return h >>> 0;
}

export const sma = (values: number[], period: number) =>
  values.length < period ? null : round(values.slice(-period).reduce((a, b) => a + b, 0) / period);

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i]! * k + e * (1 - k);
  return round(e);
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = gain / period / (loss / period);
  return round(100 - 100 / (1 + rs));
}

export function macd(values: number[]) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  if (fast === null || slow === null) return null;
  const line = round(fast - slow);
  // Signal approximated from the last 9 MACD readings.
  const series: number[] = [];
  for (let n = Math.max(26, values.length - 12); n <= values.length; n++) {
    const f = ema(values.slice(0, n), 12);
    const s = ema(values.slice(0, n), 26);
    if (f !== null && s !== null) series.push(f - s);
  }
  const signal = ema(series, Math.min(9, series.length)) ?? line;
  return { line, signal: round(signal), histogram: round(line - signal) };
}

export function atr(bars: DailyBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const b = bars[i]!;
    const prev = bars[i - 1]!;
    sum += Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close));
  }
  return round(sum / period);
}

/** Typical-price VWAP over the most recent sessions (proxy for intraday VWAP). */
export function vwap(bars: DailyBar[], period = 5): number | null {
  const slice = bars.slice(-period);
  if (!slice.length) return null;
  let pv = 0;
  let v = 0;
  for (const b of slice) {
    pv += ((b.high + b.low + b.close) / 3) * b.volume;
    v += b.volume;
  }
  return v ? round(pv / v) : null;
}

/** Relative volume: latest session volume against the 20-session average. */
export function rvol(bars: DailyBar[]): number | null {
  if (bars.length < 21) return null;
  const avg = bars.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20;
  return avg ? round(bars.at(-1)!.volume / avg) : null;
}

export const returnOver = (bars: DailyBar[], sessions: number) => {
  if (bars.length <= sessions) return null;
  const then = bars.at(-1 - sessions)!.close;
  return round(((bars.at(-1)!.close - then) / then) * 100);
};

export const high52w = (bars: DailyBar[]) => round(Math.max(...bars.slice(-250).map((b) => b.high)));

/** Traded value in crore rupees for the latest session. */
export const tradedValueCr = (bars: DailyBar[]) => {
  const b = bars.at(-1)!;
  return round((b.close * b.volume) / 1e7);
};

/** Average of the last N daily ranges as a percent of price — our tightness measure. */
export function tightnessPct(bars: DailyBar[], period = 5): number | null {
  const slice = bars.slice(-period);
  if (slice.length < period) return null;
  const avgRange = slice.reduce((a, b) => a + (b.high - b.low), 0) / period;
  const price = bars.at(-1)!.close;
  return price ? round((avgRange / price) * 100) : null;
}

export function higherCloseStreak(bars: DailyBar[]): number {
  let n = 0;
  for (let i = bars.length - 1; i > 0; i--) {
    if (bars[i]!.close > bars[i - 1]!.close) n++;
    else break;
  }
  return n;
}

export function rangeExpansionDays(bars: DailyBar[]): number {
  let n = 0;
  for (let i = bars.length - 1; i > 0; i--) {
    if (bars[i]!.high - bars[i]!.low > bars[i - 1]!.high - bars[i - 1]!.low) n++;
    else break;
  }
  return n;
}

export const closes = (bars: DailyBar[]) => bars.map((b) => b.close);
