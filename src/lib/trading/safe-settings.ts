import type { Settings } from "./types";

/** Configuration may tighten safety caps, never raise this profile's ceilings. */
export function enforceProfile(settings: Settings): Settings {
  const cap = (value: number, maximum: number, integer = false) => {
    const safe = Number.isFinite(value) && value > 0 ? Math.min(value, maximum) : maximum;
    return integer ? Math.max(1, Math.floor(safe)) : safe;
  };
  return {
    ...settings,
    capital: 100000,
    maxRiskPerTrade: cap(settings.maxRiskPerTrade, 500),
    maxDailyLoss: cap(settings.maxDailyLoss, 1000),
    weeklyLossLimit: cap(settings.weeklyLossLimit, 2500),
    maxTradesPerDay: cap(settings.maxTradesPerDay, 3, true),
    maxOpenPositions: cap(settings.maxOpenPositions, 2, true),
    lockAfterLosingTrades: cap(settings.lockAfterLosingTrades, 2, true),
    minRiskReward: Number.isFinite(settings.minRiskReward) ? Math.max(1.5, settings.minRiskReward) : 1.5,
    intradayOnly: true,
    allowFno: false,
    liveExecutionEnabled: false,
  };
}