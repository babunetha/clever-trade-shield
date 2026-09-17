import type { RiskState, Settings } from "@/lib/trading/types";
import type { ScanCandidate } from "./candidates";
import { atr, closes, ema, high52w, macd, rsi, rvol, SECTORS, tradedValueCr, vwap } from "./series";

/** Where the price used for verification came from, and how fresh it is. */
export interface LiveTick {
  price: number;
  asOf: string;
  source: "SIMULATED" | "DHAN_LIVE";
}

export type CandidateState = "BUY CANDIDATE" | "WAIT" | "AVOID";

export interface VerificationCheck {
  label: string;
  ok: boolean;
  detail: string;
  /** A failed blocking check forces AVOID (fail-closed). */
  blocking: boolean;
}

export interface TradePlan {
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  quantity: number;
  riskRupees: number;
  riskReward: number;
}

export interface VerificationResult {
  state: CandidateState;
  checks: VerificationCheck[];
  plan: TradePlan;
  passed: number;
  total: number;
  sector: string;
  freshnessSeconds: number;
  metrics: {
    ema10: number | null;
    ema30: number | null;
    vwap: number | null;
    rsi14: number | null;
    macdHistogram: number | null;
    atr14: number | null;
    rvol: number | null;
    tradedValueCr: number;
    pctOf52wHigh: number;
  };
}

/** Max age of a price before we refuse to act on it. */
export const MAX_TICK_AGE_SECONDS = 20;

const round = (v: number, dp = 2) => Number(v.toFixed(dp));

export function verifyCandidate(input: {
  candidate: ScanCandidate;
  tick: LiveTick;
  now?: number;
  niftyBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  sectorChangePct: number;
  settings: Settings;
  risk: RiskState;
  openPositions: number;
}): VerificationResult {
  const { candidate, tick, niftyBias, sectorChangePct, settings, risk, openPositions } = input;
  const bars = candidate.bars;
  const c = closes(bars);
  const lastCompleted = bars.at(-1)!;

  const metrics = {
    ema10: ema(c, 10),
    ema30: ema(c, 30),
    vwap: vwap(bars),
    rsi14: rsi(c, 14),
    macdHistogram: macd(c)?.histogram ?? null,
    atr14: atr(bars, 14),
    rvol: rvol(bars),
    tradedValueCr: tradedValueCr(bars),
    pctOf52wHigh: round((lastCompleted.close / high52w(bars)) * 100),
  };

  const atrValue = metrics.atr14 ?? Math.max(0.5, lastCompleted.close * 0.015);
  const entry = round(Math.max(tick.price, lastCompleted.close));
  const stopLoss = round(Math.max(0.05, entry - 1.2 * atrValue));
  const perShareRisk = Math.max(0.05, round(entry - stopLoss));
  const quantity = Math.max(0, Math.floor(settings.maxRiskPerTrade / perShareRisk));
  const target1 = round(entry + 1.5 * perShareRisk);
  const target2 = round(entry + 2.5 * perShareRisk);
  const plan: TradePlan = {
    entry,
    stopLoss,
    target1,
    target2,
    quantity,
    riskRupees: round(perShareRisk * quantity),
    riskReward: round((target1 - entry) / perShareRisk),
  };

  const freshnessSeconds = Math.max(0, Math.round(((input.now ?? Date.now()) - new Date(tick.asOf).getTime()) / 1000));
  const sector = SECTORS[candidate.symbol] ?? "Unclassified";

  const checks: VerificationCheck[] = [
    {
      label: "Price freshness",
      ok: freshnessSeconds <= MAX_TICK_AGE_SECONDS,
      detail: `${tick.source === "DHAN_LIVE" ? "Dhan live" : "Simulated"} price ${freshnessSeconds}s old (limit ${MAX_TICK_AGE_SECONDS}s)`,
      blocking: true,
    },
    {
      label: "Completed-candle confirmation",
      ok: tick.price >= lastCompleted.close,
      detail:
        tick.price >= lastCompleted.close
          ? `Holding above the last completed daily close ${lastCompleted.close}`
          : `Below the last completed daily close ${lastCompleted.close} — the running candle is not final, so no entry`,
      blocking: true,
    },
    {
      label: "Trend (EMA 10 > EMA 30)",
      ok: metrics.ema10 !== null && metrics.ema30 !== null && metrics.ema10 > metrics.ema30,
      detail: `EMA10 ${metrics.ema10 ?? "—"} vs EMA30 ${metrics.ema30 ?? "—"}`,
      blocking: false,
    },
    {
      label: "Above VWAP",
      ok: metrics.vwap !== null && tick.price > metrics.vwap,
      detail: `Price ${round(tick.price)} vs VWAP ${metrics.vwap ?? "—"}`,
      blocking: false,
    },
    {
      label: "RSI 14 in 45-75",
      ok: metrics.rsi14 !== null && metrics.rsi14 >= 45 && metrics.rsi14 <= 75,
      detail: `RSI ${metrics.rsi14 ?? "—"}${metrics.rsi14 !== null && metrics.rsi14 > 75 ? " — overbought, chasing risk" : ""}`,
      blocking: false,
    },
    {
      label: "MACD histogram positive",
      ok: (metrics.macdHistogram ?? -1) > 0,
      detail: `Histogram ${metrics.macdHistogram ?? "—"}`,
      blocking: false,
    },
    {
      label: "Relative volume >= 1.2x",
      ok: (metrics.rvol ?? 0) >= 1.2,
      detail: `RVOL ${metrics.rvol ?? "—"}x`,
      blocking: false,
    },
    {
      label: "Liquidity (traded value >= ₹5 Cr)",
      ok: metrics.tradedValueCr >= 5,
      detail: `₹${metrics.tradedValueCr} Cr traded in the last session`,
      blocking: true,
    },
    {
      label: "Breakout / volume confirmation",
      ok: metrics.pctOf52wHigh >= 90 && (metrics.rvol ?? 0) >= 1.1,
      detail: `${metrics.pctOf52wHigh}% of the 52-week high with RVOL ${metrics.rvol ?? "—"}x`,
      blocking: false,
    },
    {
      label: "NIFTY context not opposing",
      ok: niftyBias !== "BEARISH",
      detail: `Index bias ${niftyBias}`,
      blocking: true,
    },
    {
      label: "Sector context",
      ok: sectorChangePct >= -0.25,
      detail: `${sector} peers ${sectorChangePct >= 0 ? "+" : ""}${round(sectorChangePct)}% today`,
      blocking: false,
    },
    {
      label: "ATR-based stop is sane",
      ok: perShareRisk / entry <= 0.05,
      detail: `Stop distance ${round((perShareRisk / entry) * 100)}% of price (ATR ${metrics.atr14 ?? "—"})`,
      blocking: true,
    },
    {
      label: `Reward-to-risk >= ${settings.minRiskReward}`,
      ok: plan.riskReward >= settings.minRiskReward,
      detail: `R:R ${plan.riskReward} to target 1`,
      blocking: true,
    },
    {
      label: `Position size within ₹${settings.maxRiskPerTrade} risk`,
      ok: quantity > 0 && plan.riskRupees <= settings.maxRiskPerTrade,
      detail: `${quantity} shares, planned risk ₹${plan.riskRupees}`,
      blocking: true,
    },
    {
      label: `Open positions below ${settings.maxOpenPositions}`,
      ok: openPositions < settings.maxOpenPositions,
      detail: `${openPositions} open now (cap ${settings.maxOpenPositions})`,
      blocking: true,
    },
    {
      label: "Risk engine unlocked",
      ok: !risk.locked && settings.tradingEnabled,
      detail: risk.locked ? risk.lockReasons.join("; ") : settings.tradingEnabled ? "No lock active" : "Trading disabled by the emergency switch",
      blocking: true,
    },
  ];

  const blockingFailed = checks.some((c2) => c2.blocking && !c2.ok);
  const passed = checks.filter((c2) => c2.ok).length;
  const nonBlockingFailed = checks.filter((c2) => !c2.blocking && !c2.ok).length;

  const state: CandidateState = blockingFailed ? "AVOID" : nonBlockingFailed <= 1 ? "BUY CANDIDATE" : "WAIT";

  return { state, checks, plan, passed, total: checks.length, sector, freshnessSeconds, metrics };
}

export const stateClasses: Record<CandidateState, string> = {
  "BUY CANDIDATE": "bg-bull-muted text-bull border-bull/40",
  WAIT: "bg-warn-muted text-warn border-warn/40",
  AVOID: "bg-bear-muted text-bear border-bear/40",
};
