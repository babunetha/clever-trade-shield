import { z } from "zod";
import { atr, ema, sma, rsi, rvol, macd, type DailyBar } from "@/lib/scanner/series";
import { backtestTrendBreakout, walkForwardTrendBreakout, researchScore } from "./backtest";
import type { ScanCandidate } from "@/lib/scanner/candidates";

export const researchInput = z.object({ runId: z.string().uuid().optional() });
export const ideaInput = z.object({
  runId: z.string().uuid(),
  symbol: z.string().regex(/^[A-Z0-9&.-]{1,30}$/),
});
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface Instrument {
  securityId: string;
  tradingSymbol: string;
  customSymbol: string;
}
export interface ResearchIdea {
  schema: "research_candidate.v1";
  generated_at: string;
  symbol: string;
  exchange: "NSE_EQ";
  security_id: string;
  setup_type: string;
  verdict: "WAIT" | "NO_TRADE";
  evidence: Array<{
    field: string;
    value: number | string | null;
    source: string;
    source_ts: string;
    fetched_at: string;
    status: "OK" | "NOT_AVAILABLE";
  }>;
  trigger: string;
  invalidation: string;
  data_quality: { status: "PASS" | "FAIL"; errors: string[] };
  strategy: { id: string; version: string };
  candidate: ScanCandidate | null;
  candles: Candle[];
  backtest: ReturnType<typeof backtestTrendBreakout> | null;
  walkForward: ReturnType<typeof walkForwardTrendBreakout> | null;
  analysis?: string;
  handedOffAt?: string;
}
export interface ResearchRun {
  id: string;
  createdAt: string;
  updatedAt: string;
  universe: Instrument[];
  cursor: number;
  ideas: ResearchIdea[];
  status: "RUNNING" | "COMPLETE" | "BLOCKED";
  error: string | null;
}

/** No repairs, guessed candles or sorting: corrupt upstream history blocks research. */
export function validateCandles(candles: Candle[], now = Date.now()) {
  const errors: string[] = [];
  const completed: Candle[] = [];
  let previous = 0;
  for (const c of candles) {
    if (
      ![c.timestamp, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) ||
      Math.min(c.open, c.high, c.low, c.close) <= 0 ||
      c.volume < 0 ||
      c.high < Math.max(c.open, c.close, c.low) ||
      c.low > Math.min(c.open, c.close)
    )
      errors.push("Invalid OHLCV");
    if (c.timestamp <= previous) errors.push("Duplicate or unordered timestamp");
    if (c.timestamp * 1000 > now) errors.push("Future timestamp");
    // Daily candles are complete only after that IST session's 15:30 close.
    const day = Math.floor((c.timestamp * 1000 + 330 * 60000) / 86400000);
    const closeTime = day * 86400000 + 600 * 60000;
    if (closeTime <= now) completed.push(c);
    previous = c.timestamp;
  }
  if (completed.length < 220) errors.push("At least 220 completed daily candles required");
  const last = completed.at(-1);
  if (last && now - last.timestamp * 1000 > 5 * 86400000)
    errors.push("Daily history is stale; holiday calendar confirmation required");
  // Weekends/holidays are not fabricated; material gaps need calendar validation.
  if (
    completed.some(
      (c, i) => i > 0 && c.timestamp - (completed[i - 1]?.timestamp ?? c.timestamp) > 7 * 86400,
    )
  )
    errors.push("History gap exceeds seven days");
  return { completed, errors: [...new Set(errors)] };
}

export function buildResearchIdea(
  ins: Instrument,
  candles: Candle[],
  fetchedAt: string,
  failure?: string,
): ResearchIdea {
  const quality = validateCandles(candles, Date.parse(fetchedAt));
  if (failure) quality.errors.push(failure);
  const pass = quality.errors.length === 0;
  const bars: DailyBar[] = quality.completed.map((c, i) => ({ ...c, i }));
  const closes = bars.map((c) => c.close);
  const last = quality.completed.at(-1);
  const e10 = pass ? ema(closes, 10) : null;
  const e30 = pass ? ema(closes, 30) : null;
  const a = pass ? atr(bars) : null;
  const trend = pass && e10 !== null && e30 !== null && e10 > e30;
  const backtest = pass ? backtestTrendBreakout(bars) : null;
  const wf = pass ? walkForwardTrendBreakout(bars) : null;
  const sourceTs = last ? new Date(last.timestamp * 1000).toISOString() : fetchedAt;
  const values: Record<string, number | string | null> = {
    daily_close: pass ? (last?.close ?? null) : null,
    ema10: e10,
    ema30: e30,
    sma6: pass ? sma(closes, 6) : null,
    sma30: pass ? sma(closes, 30) : null,
    rsi14: pass ? rsi(closes) : null,
    atr14: a,
    daily_rvol: pass ? rvol(bars) : null,
    macd_histogram: pass ? (macd(closes)?.histogram ?? null) : null,
    support20: pass ? Math.min(...bars.slice(-20).map((b) => b.low)) : null,
    resistance20: pass ? Math.max(...bars.slice(-20).map((b) => b.high)) : null,
    intraday_vwap: null,
    live_quote: null,
    news: null,
    fundamentals: null,
    market_regime: null,
    volume_profile: null,
    SMT: null,
    PSP: null,
    CISD: null,
    VCP: null,
  };
  const matched = [
    `Daily EMA10 ${e10} / EMA30 ${e30}`,
    `Daily RSI ${values.rsi14}`,
    "Intraday confirmation required",
  ];
  const candidate: ScanCandidate | null =
    trend && last && backtest
      ? {
          id: `RESEARCH-${ins.securityId}`,
          scannerId: "POSSIBLE_BREAKOUT",
          scannerName: "Market Researcher daily trend",
          symbol: ins.tradingSymbol,
          name: ins.customSymbol,
          scanClose: last.close,
          matched,
          scannedAt: sourceTs,
          bars,
          research: { ...backtest, score: researchScore(backtest) },
          securityId: ins.securityId,
        }
      : null;
  return {
    schema: "research_candidate.v1",
    generated_at: fetchedAt,
    symbol: ins.tradingSymbol,
    exchange: "NSE_EQ",
    security_id: ins.securityId,
    setup_type: "daily_trend_watchlist",
    verdict: trend ? "WAIT" : "NO_TRADE",
    evidence: Object.entries(values).map(([field, value]) => ({
      field,
      value,
      source: value === null ? "NOT_AVAILABLE" : "dhan",
      source_ts: sourceTs,
      fetched_at: fetchedAt,
      status: value === null ? "NOT_AVAILABLE" : "OK",
    })),
    trigger:
      "Fresh Dhan quote, completed intraday breakout and CTS independent verification required",
    invalidation: !pass
      ? quality.errors.join("; ")
      : "Daily trend lost, stale price, missing intraday or risk confirmation",
    data_quality: { status: pass ? "PASS" : "FAIL", errors: quality.errors },
    strategy: { id: "daily-trend-watchlist", version: "1.0.0" },
    candidate,
    candles: quality.completed,
    backtest,
    walkForward: wf,
  };
}

export function mayHandoff(idea: ResearchIdea) {
  return idea.data_quality.status === "PASS" && idea.verdict === "WAIT" && idea.candidate !== null;
}
