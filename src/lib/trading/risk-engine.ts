import type { RiskState, Settings, Signal, Trade } from "./types";

export interface RiskDecision { allowed: boolean; reasons: string[]; }

export function calculateRiskState(trades: Trade[], settings: Settings, now = new Date()): RiskState {
  const isToday = (iso: string) => new Date(iso).toDateString() === now.toDateString();
  const todays = trades.filter((t) => isToday(t.openedAt));
  const closed = todays.filter((t) => t.status === "CLOSED");
  const open = todays.filter((t) => t.status === "OPEN");
  const realisedPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const openRisk = open.reduce((sum, t) => sum + Math.abs(t.entry - t.stopLoss) * t.quantity, 0);
  const losingTradesToday = closed.filter((t) => (t.pnl ?? 0) < 0).length;
  const winningTradesToday = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const riskUsed = todays.reduce((sum, t) => sum + Math.abs(t.entry - t.stopLoss) * t.quantity, 0);
  const lockReasons: string[] = [];
  if (!settings.tradingEnabled) lockReasons.push("Trading manually disabled (emergency switch).");
  if (realisedPnl <= -settings.maxDailyLoss) lockReasons.push("Daily loss limit hit (₹" + settings.maxDailyLoss + ").");
  if (losingTradesToday >= settings.lockAfterLosingTrades) lockReasons.push(losingTradesToday + " losing trades today (limit " + settings.lockAfterLosingTrades + ").");
  if (todays.length >= settings.maxTradesPerDay) lockReasons.push("Maximum " + settings.maxTradesPerDay + " trades/day reached.");
  return {
    realisedPnl, openRisk, tradesToday: todays.length, losingTradesToday, winningTradesToday, riskUsed,
    riskBudgetLeft: Math.max(0, settings.maxDailyLoss - Math.max(0, -realisedPnl) - openRisk),
    lossBudgetLeft: Math.max(0, settings.maxDailyLoss + Math.min(0, realisedPnl)),
    tradesLeft: Math.max(0, settings.maxTradesPerDay - todays.length), locked: lockReasons.length > 0, lockReasons,
    equity: settings.capital + trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
  };
}

export function validateSignalRisk(signal: Signal, settings: Settings, risk: RiskState): RiskDecision {
  const reasons: string[] = [];
  if (!settings.tradingEnabled) reasons.push("Trading is disabled.");
  if (risk.locked) reasons.push(...risk.lockReasons);
  if (signal.quantity <= 0) reasons.push("Position size is zero.");
  if (signal.riskRupees > settings.maxRiskPerTrade) reasons.push("Risk ₹" + signal.riskRupees + " exceeds the ₹" + settings.maxRiskPerTrade + " per-trade cap.");
  if (signal.riskReward < settings.minRiskReward) reasons.push("R:R " + signal.riskReward + " is below the minimum " + settings.minRiskReward + ".");
  return { allowed: reasons.length === 0, reasons };
}
