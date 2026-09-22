import { resolveDhanInstruments, type DhanInstrument } from "@/lib/market/instruments";
import { getDhanDailyHistoricalCandles, getDhanHistoricalCandles, getDhanQuote, type DhanCandle } from "@/lib/dhan.server";
import { SCANNERS, type ScannerConfig } from "./definitions";
import { high52w, higherCloseStreak, returnOver, tightnessPct, tradedValueCr, type DailyBar } from "./series";
import { backtestTrendBreakout, researchScore, walkForwardTrendBreakout } from "@/lib/research/backtest";
import type { ScanCandidate } from "./candidates";

const crit = (c: ScannerConfig, id: string, key: string, fallback: number) =>
  c[id as keyof ScannerConfig]?.criteria[key] ?? fallback;

const toBars = (x: DhanCandle[]): DailyBar[] =>
  x.map((c, i) => ({ i, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })).filter((b) => b.close > 0);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));

const universe = () => {
  const raw = process.env["CTS_UNIVERSE_SYMBOLS"]?.trim();
  return raw
    ? raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 500)
    : [
        "RELIANCE","HDFCBANK","ICICIBANK","SBIN","AXISBANK","KOTAKBANK","INDUSINDBK","BAJFINANCE","BAJAJFINSV",
        "INFY","TCS","HCLTECH","WIPRO","TECHM","LTIM","COFORGE","PERSISTENT","MPHASIS","TATAMOTORS","MARUTI","M&M",
        "EICHERMOT","HEROMOTOCO","BAJAJ-AUTO","TVSMOTOR","ITC","HINDUNILVR","NESTLEIND","BRITANNIA","TATACONSUM",
        "ASIANPAINT","TITAN","TRENT","BHARTIARTL","ADANIENT","ADANIPORTS","JIOFIN","LT","BEL","HAL","BHEL","POWERGRID",
        "NTPC","ONGC","COALINDIA","TATASTEEL","JSWSTEEL","HINDALCO","VEDL","ULTRACEMCO","GRASIM","SHREECEM","SUNPHARMA",
        "DRREDDY","CIPLA","DIVISLAB","APOLLOHOSP","MAXHEALTH","RECLTD","PFC","IRFC","IREDA","DLF","GODREJPROP","PIDILITIND",
        "SIEMENS","ABB","HAVELLS","DIXON","VOLTAS","POLYCAB","CUMMINSIND","INDIGO","ETERNAL","ZOMATO","DELHIVERY","DMART",
        "PAYTM","INDIANHOTEL","SRF","UPL","COROMANDEL",
      ];
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

function istMinutes(ts: number) {
  const d = new Date(ts * 1000);
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % 1440;
}

function istDate(ts?: number) {
  const d = ts ? new Date(ts * 1000) : new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

function todayBars(c: DhanCandle[]) {
  const day = istDate();
  return c
    .filter((x) => istDate(x.timestamp) === day && istMinutes(x.timestamp) >= 555 && istMinutes(x.timestamp) <= 930)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function intraday(c: DhanCandle[]) {
  if (c.length < 6) return null;
  const first = c.filter((x) => istMinutes(x.timestamp) >= 555 && istMinutes(x.timestamp) < 585);
  let pv = 0;
  let v = 0;
  for (const b of c) {
    pv += ((b.high + b.low + b.close) / 3) * b.volume;
    v += b.volume;
  }
  const last = c[c.length - 1]!;
  const vwap = v ? pv / v : last.close;
  const openingHigh = first.length ? Math.max(...first.map((x) => x.high)) : last.high;
  const openingLow = first.length ? Math.min(...first.map((x) => x.low)) : last.low;
  const sessionVol = c.reduce((sum, b) => sum + b.volume, 0);
  const elapsedMinutes = Math.max(5, Math.min(375, istMinutes(last.timestamp) - 555 + 5));
  return {
    lastPrice: last.close,
    vwap,
    openingHigh,
    openingLow,
    breakout: last.close > openingHigh && last.close > vwap,
    sessionVol,
    range: openingHigh - openingLow,
    elapsedMinutes,
  };
}

function timeNormalizedRvol(sessionVol: number, elapsedMinutes: number, bars: DailyBar[]) {
  const lookback = bars.slice(-20);
  if (!lookback.length) return 0;
  const avgDailyVolume = lookback.reduce((sum, b) => sum + b.volume, 0) / lookback.length;
  const expected = Math.max(1, avgDailyVolume * (elapsedMinutes / 375));
  return sessionVol / expected;
}

/**
 * Real Dhan scanner: daily history is used only for completed-session research;
 * current-day 5m candles and one batched quote request are used for entry confirmation.
 * Live orders are never placed.
 */
export async function runDhanLiveScanners(config: ScannerConfig): Promise<ScanCandidate[]> {
  const symbols = universe();
  const instruments = await resolveDhanInstruments(symbols);
  const by = new Map(instruments.map((x) => [x.tradingSymbol.toUpperCase(), x]));

  // Dhan historical data is rate-limited; keep concurrent reads conservative.
  const daily = await mapLimit(symbols, 2, async (symbol) => {
    const ins = by.get(symbol);
    if (!ins || ins.exchangeSegment !== "NSE_EQ") return null;
    const r = await getDhanDailyHistoricalCandles({
      securityId: ins.securityId,
      exchangeSegment: "NSE_EQ",
      instrument: "EQUITY",
      fromDate: daysAgo(520),
      toDate: iso(new Date()),
    });
    if (!r.ok) return null;
    const bars = toBars(r.data);
    return bars.length >= 220 ? { symbol, instrument: ins, bars } : null;
  });

  const ranked = daily
    .filter((x): x is { symbol: string; instrument: DhanInstrument; bars: DailyBar[] } => Boolean(x))
    .map((x) => {
      const completed = x.bars.slice(0, -1);
      const last = completed.at(-1);
      if (!last) return null;
      const r22 = returnOver(completed, 22) ?? 0;
      const r66 = returnOver(completed, 66) ?? 0;
      const tv = tradedValueCr(completed);
      const h = high52w(completed) || last.close;
      return { ...x, bars: completed, score: r22 * 0.45 + r66 * 0.25 + (last.close / h) * 20 + Math.min(5, tv / 100) };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);

  // Only request the current trading session; do not pull 90 days of 5m candles.
  const sessionDay = istDate();
  const intradayRows = await mapLimit(ranked, 2, async (x) => {
    const r = await getDhanHistoricalCandles({
      securityId: x.instrument.securityId,
      exchangeSegment: "NSE_EQ",
      instrument: "EQUITY",
      interval: "5",
      fromDate: sessionDay + " 09:15:00",
      toDate: sessionDay + " 15:30:00",
    });
    return { ...x, today: r.ok ? todayBars(r.data) : [] };
  });

  // Quote API supports batched security IDs, so use one request instead of 40 concurrent calls.
  const quoteResult = await getDhanQuote({
    securityIds: ranked.map((x) => x.instrument.securityId),
    exchangeSegment: "NSE_EQ",
  });
  const quoteMap = quoteResult.ok ? quoteResult.data : {};

  const out: ScanCandidate[] = [];
  const scannedAt = new Date().toISOString();

  for (const x of intradayRows) {
    const m = intraday(x.today);
    if (!m) continue;

    const research = backtestTrendBreakout(x.bars);
    const wf = walkForwardTrendBreakout(x.bars);
    const rvol = timeNormalizedRvol(m.sessionVol, m.elapsedMinutes, x.bars);
    const r22 = returnOver(x.bars, 22) ?? -999;
    const r66 = returnOver(x.bars, 66) ?? -999;
    const streak = higherCloseStreak(x.bars);
    const tight = tightnessPct(x.bars) ?? 999;
    const pct = (x.bars.at(-1)!.close / (high52w(x.bars) || x.bars.at(-1)!.close)) * 100;

    const pass = SCANNERS.some((def) => {
      if (!config[def.id]?.enabled) return false;
      if (def.id === "BEST_BUY_INTRADAY") {
        return m.breakout && m.lastPrice > m.vwap && rvol >= 1.1;
      }
      if (def.id === "UP20_1M_30_3M") {
        return r22 >= crit(config, def.id, "return22", 20) && r66 >= crit(config, def.id, "return66", 30);
      }
      if (def.id === "STRONG_STOCKS") return streak >= crit(config, def.id, "streak", 5);
      if (def.id === "UP20_TIGHTNESS") return r22 >= crit(config, def.id, "return22", 20) && tight <= crit(config, def.id, "tightness", 4);
      if (def.id === "POSSIBLE_BREAKOUT") return pct >= crit(config, def.id, "minPctOf52w", 90);
      return false;
    });
    if (!pass) continue;

    const price = quoteMap[x.instrument.securityId]?.lastPrice ?? m.lastPrice;
    const marketScore = Math.min(
      100,
      Number((35 + (m.breakout ? 30 : 0) + (m.lastPrice > m.vwap ? 15 : 0) + Math.min(20, rvol * 8)).toFixed(1)),
    );

    out.push({
      id: "DHAN-" + x.instrument.securityId,
      scannerId: "BEST_BUY_INTRADAY",
      scannerName: "Dhan multi-stage intraday scanner",
      symbol: x.symbol,
      name: x.instrument.customSymbol || x.symbol,
      scanClose: price,
      matched: [
        "Dhan completed daily OHLCV",
        "Dhan current-session 5m data",
        "Intraday VWAP " + m.vwap.toFixed(2),
        "Opening range " + m.openingLow.toFixed(2) + "-" + m.openingHigh.toFixed(2),
        "Time-normalized RVOL " + rvol.toFixed(2) + "x",
        "ORB " + (m.breakout ? "confirmed" : "not confirmed"),
        "Walk-forward OOS windows " + wf.stability.profitableWindows + "/" + wf.stability.totalWindows,
      ],
      scannedAt,
      bars: x.bars,
      research: { ...research, score: researchScore(research) },
      marketScore,
      securityId: x.instrument.securityId,
    });
  }

  return out
    .sort((a, b) => 0.55 * (b.marketScore ?? 0) + 0.45 * b.research.score - (0.55 * (a.marketScore ?? 0) + 0.45 * a.research.score))
    .slice(0, 20);
}
