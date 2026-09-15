import type { Bias, IndexQuote, Indicators, Quote, Signal, Side } from "./types";

/**
 * SIMULATED MARKET DATA ONLY.
 * Deterministic seeded pseudo-random walk — no broker feed, no real prices.
 * Never call these at module scope (edge runtime forbids global-scope randomness);
 * call them from lazy initializers, effects, or handlers.
 */

export function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

interface Universe {
  symbol: string;
  name: string;
  base: number;
  lot: number;
}

export const UNIVERSE: Universe[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", base: 1412.5, lot: 1 },
  { symbol: "HDFCBANK", name: "HDFC Bank", base: 1684.2, lot: 1 },
  { symbol: "INFY", name: "Infosys", base: 1568.9, lot: 1 },
  { symbol: "TATAMOTORS", name: "Tata Motors", base: 712.35, lot: 1 },
  { symbol: "SBIN", name: "State Bank of India", base: 812.6, lot: 1 },
  { symbol: "ICICIBANK", name: "ICICI Bank", base: 1256.4, lot: 1 },
  { symbol: "ITC", name: "ITC Ltd", base: 421.15, lot: 1 },
  { symbol: "AXISBANK", name: "Axis Bank", base: 1132.8, lot: 1 },
  { symbol: "TATASTEEL", name: "Tata Steel", base: 164.7, lot: 1 },
  { symbol: "LT", name: "Larsen & Toubro", base: 3620.5, lot: 1 },
  { symbol: "MARUTI", name: "Maruti Suzuki", base: 12880.0, lot: 1 },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", base: 1642.9, lot: 1 },
];

const round = (v: number, dp = 2) => Number(v.toFixed(dp));

function biasFrom(v: number): Bias {
  if (v > 0.62) return "BULLISH";
  if (v < 0.38) return "BEARISH";
  return "NEUTRAL";
}

export function buildQuotes(seed: number): Quote[] {
  const rng = makeRng(seed);
  return UNIVERSE.map((u) => {
    const drift = (rng() - 0.5) * 0.035;
    const ltp = round(u.base * (1 + drift));
    const change = round(ltp - u.base);
    const spread = u.base * (0.004 + rng() * 0.012);
    return {
      symbol: u.symbol,
      name: u.name,
      ltp,
      prevClose: u.base,
      change,
      changePct: round((change / u.base) * 100),
      dayHigh: round(Math.max(ltp, u.base) + spread * rng()),
      dayLow: round(Math.min(ltp, u.base) - spread * rng()),
      volume: Math.round(180000 + rng() * 4200000),
    };
  });
}

export function stepQuotes(quotes: Quote[], seed: number): Quote[] {
  const rng = makeRng(seed);
  return quotes.map((q) => {
    const tick = q.ltp * (rng() - 0.5) * 0.0032;
    const ltp = round(Math.max(1, q.ltp + tick));
    const change = round(ltp - q.prevClose);
    return {
      ...q,
      ltp,
      change,
      changePct: round((change / q.prevClose) * 100),
      dayHigh: round(Math.max(q.dayHigh, ltp)),
      dayLow: round(Math.min(q.dayLow, ltp)),
      volume: q.volume + Math.round(rng() * 24000),
    };
  });
}

/** Steps index quotes and recomputes bias from the new change (bias must never be stale). */
export function stepIndices(indices: IndexQuote[], seed: number): IndexQuote[] {
  return stepQuotes(indices, seed).map((q, i) => {
    const threshold = q.prevClose * 0.0012;
    return {
      ...q,
      bias: q.change > threshold ? "BULLISH" : q.change < -threshold ? "BEARISH" : (indices[i]?.bias === undefined ? "NEUTRAL" : "NEUTRAL"),
    } satisfies IndexQuote;
  });
}

export function buildIndices(seed: number): IndexQuote[] {
  const rng = makeRng(seed + 7717);
  return [
    { symbol: "NIFTY 50", name: "Nifty 50", base: 24218.4 },
    { symbol: "BANKNIFTY", name: "Nifty Bank", base: 52140.6 },
  ].map((i) => {
    const drift = (rng() - 0.48) * 0.014;
    const ltp = round(i.base * (1 + drift));
    const change = round(ltp - i.base);
    return {
      symbol: i.symbol,
      name: i.name,
      ltp,
      prevClose: i.base,
      change,
      changePct: round((change / i.base) * 100),
      dayHigh: round(ltp * 1.003),
      dayLow: round(ltp * 0.997),
      volume: 0,
      bias: change > i.base * 0.0012 ? "BULLISH" : change < -i.base * 0.0012 ? "BEARISH" : "NEUTRAL",
    } satisfies IndexQuote;
  });
}

function buildIndicators(ltp: number, side: Side, rng: () => number): Indicators {
  const k = side === "LONG" ? 1 : -1;
  const ema9 = round(ltp * (1 - k * 0.0015));
  const ema20 = round(ltp * (1 - k * 0.0038));
  const ema50 = round(ltp * (1 - k * 0.0085));
  const ema200 = round(ltp * (1 - k * 0.021));
  const avgVolume = Math.round(900000 + rng() * 1800000);
  const relVolume = round(1.15 + rng() * 1.6);
  const macdLine = round(k * (0.8 + rng() * 2.4), 3);
  const macdSignal = round(macdLine - k * (0.2 + rng() * 0.7), 3);
  return {
    ema9,
    ema20,
    ema50,
    ema200,
    rsi14: round(side === "LONG" ? 55 + rng() * 15 : 30 + rng() * 15, 1),
    macdLine,
    macdSignal,
    macdHist: round(macdLine - macdSignal, 3),
    vwap: round(ltp * (1 - k * 0.0022)),
    adx: round(21 + rng() * 17, 1),
    volume: Math.round(avgVolume * relVolume),
    avgVolume,
    relVolume,
    support: round(ltp * (1 - 0.009 - rng() * 0.006)),
    resistance: round(ltp * (1 + 0.009 + rng() * 0.008)),
    context5m: biasFrom(side === "LONG" ? 0.7 + rng() * 0.3 : rng() * 0.32),
    context15m: biasFrom(side === "LONG" ? 0.62 + rng() * 0.35 : rng() * 0.4),
  };
}

export interface SignalInput {
  seed: number;
  quotes: Quote[];
  indices: IndexQuote[];
  maxRiskPerTrade: number;
  count?: number;
  now?: Date;
}

/** Position size is derived from risk: qty = floor(maxRisk / per-share risk). */
export function sizePosition(entry: number, stopLoss: number, maxRisk: number) {
  const perShare = Math.abs(entry - stopLoss);
  if (perShare <= 0) return { quantity: 0, perShare: 0, riskRupees: 0 };
  const quantity = Math.max(0, Math.floor(maxRisk / perShare));
  return { quantity, perShare: round(perShare), riskRupees: round(quantity * perShare) };
}

export function buildSignals(input: SignalInput): Signal[] {
  const { seed, quotes, indices, maxRiskPerTrade } = input;
  const rng = makeRng(seed + 4242);
  const now = input.now ?? new Date();
  const count = input.count ?? 4;
  const nifty = indices[0]?.bias ?? "NEUTRAL";
  const bankNifty = indices[1]?.bias ?? "NEUTRAL";

  const picks = [...quotes].sort(() => rng() - 0.5).slice(0, count);

  return picks.map((q, idx) => {
    const side: Side = rng() > 0.42 ? "LONG" : "SHORT";
    const k = side === "LONG" ? 1 : -1;
    const entry = round(q.ltp * (1 + k * 0.0008));
    const stopLoss = round(entry * (1 - k * (0.006 + rng() * 0.005)));
    const risk = Math.abs(entry - stopLoss);
    const target1 = round(entry + k * risk * (1.5 + rng() * 0.3));
    const target2 = round(entry + k * risk * (2.6 + rng() * 0.8));
    const { quantity, riskRupees } = sizePosition(entry, stopLoss, maxRiskPerTrade);
    const rewardRupees = round(quantity * Math.abs(target1 - entry));
    const indicators = buildIndicators(q.ltp, side, rng);
    const score = Math.round(58 + rng() * 38);
    const generatedAt = new Date(now.getTime() - idx * 4 * 60000).toISOString();

    const rationale = [
      side === "LONG"
        ? "Price above EMA 9/20/50 with 200 EMA sloping up — trend continuation setup"
        : "Price below EMA 9/20/50 with 200 EMA rolling over — trend breakdown setup",
      `RSI(14) at ${indicators.rsi14} — ${side === "LONG" ? "momentum expanding, not overbought" : "momentum weak, not oversold"}`,
      `MACD histogram ${indicators.macdHist > 0 ? "positive" : "negative"} (${indicators.macdHist}) and ${side === "LONG" ? "above" : "below"} signal line`,
      `${side === "LONG" ? "Holding above" : "Rejected at"} VWAP ${indicators.vwap}`,
      `ADX ${indicators.adx} — ${indicators.adx > 25 ? "trending" : "developing"} strength`,
      `Relative volume ${indicators.relVolume}x on 5m/15m ${indicators.context5m}/${indicators.context15m} context`,
      `Index bias: Nifty ${nifty} · Bank Nifty ${bankNifty}`,
    ];

    return {
      id: `SIG-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${q.symbol}-${idx + 1}`,
      symbol: q.symbol,
      name: q.name,
      side,
      ltp: q.ltp,
      entry,
      stopLoss,
      target1,
      target2,
      quantity,
      riskRupees,
      rewardRupees,
      riskReward: round(Math.abs(target1 - entry) / risk),
      confidence: score,
      score,
      rationale,
      indicators,
      niftyBias: nifty,
      bankNiftyBias: bankNifty,
      generatedAt,
      expiresAt: new Date(now.getTime() + 12 * 60000).toISOString(),
      status: "PENDING",
    } satisfies Signal;
  });
}
