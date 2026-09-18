import type { Bias, Indicators } from "./types";
import type { DhanCandle } from "../dhan.server";

const round = (v: number, dp = 2) => Number(v.toFixed(dp));

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const k = 2 / (period + 1);
  let value = seed;
  for (let i = period; i < values.length; i += 1) value = values[i] * k + value * (1 - k);
  return value;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function atr(candles: DhanCandle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i];
    const prev = candles[i - 1].close;
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev)));
  }
  return sma(tr, period);
}

function macd(values: number[]) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  if (fast === null || slow === null) return { line: null, signal: null, hist: null };
  const lineSeries: number[] = [];
  for (let i = 26; i <= values.length; i += 1) {
    const f = ema(values.slice(0, i), 12);
    const s = ema(values.slice(0, i), 26);
    if (f !== null && s !== null) lineSeries.push(f - s);
  }
  const signal = ema(lineSeries, 9);
  const line = lineSeries.at(-1) ?? fast - slow;
  return { line, signal, hist: signal === null ? null : line - signal };
}

function vwap(candles: DhanCandle[]): number | null {
  if (!candles.length) return null;
  let pv = 0;
  let volume = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    volume += c.volume;
  }
  return volume > 0 ? pv / volume : null;
}

function adx(candles: DhanCandle[], period = 14): number | null {
  if (candles.length < period * 2 + 1) return null;
  const tr: number[] = [];
  const plus: number[] = [];
  const minus: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const cur = candles[i];
    const prev = candles[i - 1];
    tr.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
    const up = cur.high - prev.high;
    const down = prev.low - cur.low;
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
  }
  const dx: number[] = [];
  for (let i = period - 1; i < tr.length; i += 1) {
    const atrValue = tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    if (atrValue === 0) continue;
    const pdi = 100 * (plus.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period) / atrValue;
    const mdi = 100 * (minus.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period) / atrValue;
    dx.push(pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi));
  }
  return sma(dx, period);
}

function bias(a: number | null, b: number | null): Bias {
  if (a === null || b === null) return "NEUTRAL";
  if (a > b * 1.001) return "BULLISH";
  if (a < b * 0.999) return "BEARISH";
  return "NEUTRAL";
}

export function calculateIndicators(candles: DhanCandle[]): Indicators | null {
  if (candles.length < 200) return null;
  const closes = candles.map((c) => c.close);
  const e9 = ema(closes, 9);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes);
  const m = macd(closes);
  const a = atr(candles);
  const v = vwap(candles);
  const d = adx(candles);
  const avgVolume = sma(candles.map((c) => c.volume), 20) ?? 0;
  const last = candles.at(-1)!;
  const support = Math.min(...candles.slice(-20).map((c) => c.low));
  const resistance = Math.max(...candles.slice(-20).map((c) => c.high));
  if ([e9, e20, e50, e200, r, m.line, m.signal, m.hist, a, v, d].some((x) => x === null)) return null;
  return {
    ema9: round(e9!), ema20: round(e20!), ema50: round(e50!), ema200: round(e200!),
    rsi14: round(r!, 1), macdLine: round(m.line!, 3), macdSignal: round(m.signal!, 3), macdHist: round(m.hist!, 3),
    vwap: round(v!), adx: round(d!, 1), atr14: round(a!), volume: last.volume, avgVolume: round(avgVolume),
    relVolume: avgVolume > 0 ? round(last.volume / avgVolume, 2) : 0,
    support: round(support), resistance: round(resistance),
    context5m: bias(e9, e20), context15m: bias(e20, e50),
  };
}
