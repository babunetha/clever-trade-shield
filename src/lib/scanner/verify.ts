import type { RiskState, Settings } from "@/lib/trading/types";
import type { ScanCandidate } from "./candidates";
import { atr, closes, ema, high52w, macd, rsi, rvol, SECTORS, tradedValueCr, vwap } from "./series";

/** Only authoritative broker data may be used for a trade decision. */
export interface LiveTick {
  price: number;
  asOf: string;
  source: "DHAN_LIVE";
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
  const lastCompleted = bars.at(-1);

  const metrics = {
    ema10: ema(c, 10),
    ema30: ema(c, 30),
    vwap: vwap(bars),
    rsi14: rsi(c, 14),
    macdHistogram: macd(c)?.histogram ?? null,
    atr14: atr(bars, 14),
    rvol: rvol(bars),
    tradedValueCr: tradedValueCr(bars),
    pctOf52wHigh: lastCompleted ? round((lastCompleted.close / high52w(bars)) * 100) : 0,
  };

  // No synthetic/default indicator values are permitted. Missing ATR means no
  // structural stop can be justified, therefore no trade plan is generated.
  const atrValue = metrics.atr14;
  const entry = tick.price;
  const perShareRisk = atrValue !== null && Number.isFinite(atrValue) && atrValue > 0
    ? round(1.2 * atrValue)
    : null;
  const stopLoss = perShareRisk !== null ? round(entry - perShareRisk) : 0;
  const quantity = perShareRisk !== null && perShareRisk > 0
    ? Math.floor(settings.maxRiskPerTrade / perShareRisk)
    : 0;
  const target1 = perShareRisk !== null ? round(entry + 1.5 * perShareRisk) : 0;
  const target2 = perShareRisk !== null ? round(entry + 2.5 * perShareRisk) : 0;
  const plan: TradePlan = {
    entry,
    stopLoss,
    target1,
    target2,
    quantity,
    riskRupees: perShareRisk !== null ? round(perShareRisk * quantity) : 0,
    riskReward: perShareRisk !== null && perShareRisk > 0 ? 1.5 : 0,
  };

  const freshnessSeconds = Math.max(0, Math.round(((input.now ?? Date.now()) - new Date(tick.asOf).getTime()) / 1000));
  const sector = SECTORS[candidate.symbol] ?? "Unclassified";
  const sourceIsLive = tick.source === "DHAN_LIVE";
  const hasCompletedCandle = Boolean(lastCompleted);
  const indicatorsComplete = metrics.ema10 !== null && metrics.ema30 !== null && metrics.vwap !== null &&
    metrics.rsi14 !== null && metrics.macdHistogram !== null && metrics.atr14 !== null && metrics.rvol !== null;

  const checks: VerificationCheck[] = [
    {
      label: "Authoritative price source",
      ok: sourceIsLive && Number.isFinite(tick.price) && tick.price > 0,
      detail: sourceIsLive ? "Dhan live read-only price" : "Non-authoritative price source rejected",
      blocking: true,
    },
    {
      label: "Price freshness",
      ok: sourceIsLive && freshnessSeconds <= MAX_TICK_AGE_SECONDS,
      detail: `Dhan price ${freshnessSeconds}s old (limit ${MAX_TICK_AGE_SECONDS}s)`,
      blocking: true,
    },
    {
      label: "Completed-candle confirmation",
      ok: hasCompletedCandle && tick.price >= lastCompleted!.close,
      detail: hasCompletedCandle
        ? tick.price >= lastCompleted!.close
          ? `Holding above the last completed daily close ${lastCompleted!.close}`
          : `Below the last completed daily close ${lastCompleted!.close} — no entry`
        : "No completed candle available",
      blocking: true,
    },
    {
      label: "Required indicators available",
      ok: indicatorsComplete,
      detail: indicatorsComplete ? "EMA/VWAP/RSI/MACD/ATR/RVOL available from supplied candles" : "One or more decision-critical indicators are unavailable",
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
      detail: `RSI ${metrics.rsi14 ?? "—"}`,
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
      ok: perShareRisk !== null && entry > 0 && perShareRisk / entry <= 0.05,
      detail: perShareRisk !== null ? `Stop distance ${round((perShareRisk / entry) * 100)}% of price (ATR ${metrics.atr14})` : "ATR unavailable — stop cannot be justified",
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
