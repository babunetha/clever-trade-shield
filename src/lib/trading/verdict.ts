import type { RiskState, Settings, Signal } from "./types";

export type Verdict = "BUY SETUP" | "WAIT" | "AVOID";

export interface VerdictResult {
  verdict: Verdict;
  reasons: string[];
  /** Invalidation conditions: if any becomes true, the setup is void. */
  invalidation: string[];
}

const aligned = (signal: Signal) => {
  const want = signal.side === "LONG" ? "BULLISH" : "BEARISH";
  return signal.indicators.context5m === want && signal.indicators.context15m === want;
};

const indexConflict = (signal: Signal) => {
  const opposite = signal.side === "LONG" ? "BEARISH" : "BULLISH";
  return signal.niftyBias === opposite && signal.bankNiftyBias === opposite;
};

export function evaluateSignal(signal: Signal, settings: Settings, risk: RiskState): VerdictResult {
  const reasons: string[] = [];
  let verdict: Verdict = "WAIT";

  const hardStops: string[] = [];
  if (!settings.tradingEnabled) hardStops.push("Trading is disabled by the emergency switch");
  if (risk.locked) hardStops.push(`Risk lock active: ${risk.lockReasons[0] ?? "limits reached"}`);
  if (signal.quantity <= 0) hardStops.push("Position size computes to zero at the ₹ risk cap");
  if (signal.riskRupees > settings.maxRiskPerTrade)
    hardStops.push(`Risk ₹${signal.riskRupees} exceeds the ₹${settings.maxRiskPerTrade} per-trade cap`);
  if (signal.riskReward < settings.minRiskReward)
    hardStops.push(`R:R ${signal.riskReward} is below the ${settings.minRiskReward} minimum`);
  if (indexConflict(signal)) hardStops.push("Both Nifty and Bank Nifty bias oppose this direction");
  if (signal.status === "EXPIRED") hardStops.push("Signal window has expired");

  if (hardStops.length) {
    verdict = "AVOID";
    reasons.push(...hardStops);
  } else {
    const strong =
      signal.score >= 70 &&
      aligned(signal) &&
      signal.indicators.adx >= 22 &&
      signal.indicators.relVolume >= 1.3 &&
      signal.riskReward >= Math.max(settings.minRiskReward, 1.5);

    if (strong) {
      verdict = "BUY SETUP";
      reasons.push(
        `Score ${signal.score}/100 with 5m and 15m context both ${signal.indicators.context5m}`,
        `ADX ${signal.indicators.adx} and relative volume ${signal.indicators.relVolume}x confirm participation`,
        `R:R ${signal.riskReward} at ₹${signal.riskRupees} risk on ${signal.quantity} shares`,
      );
    } else {
      verdict = "WAIT";
      if (signal.score < 70) reasons.push(`Score ${signal.score}/100 below the 70 conviction threshold`);
      if (!aligned(signal)) reasons.push("5m and 15m context are not both aligned with the direction");
      if (signal.indicators.adx < 22) reasons.push(`ADX ${signal.indicators.adx} shows a weak trend`);
      if (signal.indicators.relVolume < 1.3)
        reasons.push(`Relative volume ${signal.indicators.relVolume}x is thin`);
      if (!reasons.length) reasons.push("Setup is acceptable but not high conviction — wait for confirmation");
    }
  }

  const dir = signal.side === "LONG" ? "below" : "above";
  const invalidation = [
    `Price closes ${dir} the stop ${signal.stopLoss} on a 5m candle`,
    `Price loses VWAP ${signal.indicators.vwap} against the trade direction`,
    `EMA 9 (${signal.indicators.ema9}) crosses back through EMA 20 (${signal.indicators.ema20}) against the trade`,
    signal.side === "LONG"
      ? `Rejection at resistance ${signal.indicators.resistance} with falling volume`
      : `Bounce off support ${signal.indicators.support} with rising volume`,
    "Index bias flips against the position",
  ];

  return { verdict, reasons, invalidation };
}

export const verdictClasses: Record<Verdict, string> = {
  "BUY SETUP": "bg-bull-muted text-bull border-bull/40",
  WAIT: "bg-warn-muted text-warn border-warn/40",
  AVOID: "bg-bear-muted text-bear border-bear/40",
};
