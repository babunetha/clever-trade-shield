import type { RiskState, Settings, Signal, Trade } from "./types";

export interface RiskDecision {
  allowed: boolean;
  reasons: string[];
}

function minutesOfDay(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function indiaMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? NaN);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? NaN);
  return hour * 60 + minute;
}

function indiaDateKey(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function inSession(now: Date, settings: Settings) {
  const current = indiaMinutes(now);
  const start = minutesOfDay(settings.sessionStart);
  const end = minutesOfDay(settings.sessionEnd);
  return current >= start && current <= end;
}

export function calculateRiskState(trades: Trade[], settings: Settings, now = new Date()): RiskState {
  const todayKey = indiaDateKey(now);
  const isToday = (iso: string) => indiaDateKey(new Date(iso)) === todayKey;
  const weekStart = now.getTime() - 7 * 86_400_000;
  const recent = trades.filter((t) => new Date(t.openedAt).getTime() >= weekStart);
  const todays = trades.filter((t) => isToday(t.openedAt));
  const closed = todays.filter((t) => t.status === "CLOSED");
  const weeklyClosed = recent.filter((t) => t.status === "CLOSED");
  const open = todays.filter((t) => t.status === "OPEN");
  const realisedPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const weeklyRealisedPnl = weeklyClosed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const openRisk = open.reduce((sum, t) => sum + Math.abs(t.entry - t.stopLoss) * t.quantity, 0);
  const losingTradesToday = closed.filter((t) => (t.pnl ?? 0) < 0).length;
  const winningTradesToday = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const riskUsed = todays.reduce((sum, t) => sum + Math.abs(t.entry - t.stopLoss) * t.quantity, 0);
  const lockReasons: string[] = [];

  if (!settings.tradingEnabled) lockReasons.push("Trading manually disabled (emergency switch).");
  if (!inSession(now, settings)) lockReasons.push("Outside configured trading session " + settings.sessionStart + "–" + settings.sessionEnd + ".");
  if (realisedPnl <= -settings.maxDailyLoss) lockReasons.push("Daily loss limit hit (₹" + settings.maxDailyLoss + ").");
  if (weeklyRealisedPnl <= -settings.weeklyLossLimit) lockReasons.push("7-day loss limit hit (₹" + settings.weeklyLossLimit + ").");
  if (losingTradesToday >= settings.lockAfterLosingTrades) lockReasons.push(losingTradesToday + " losing trades today (limit " + settings.lockAfterLosingTrades + ").");
  if (todays.length >= settings.maxTradesPerDay) lockReasons.push("Maximum " + settings.maxTradesPerDay + " trades/day reached.");
  if (open.length >= settings.maxOpenPositions) lockReasons.push("Maximum " + settings.maxOpenPositions + " open positions reached.");

  return {
    realisedPnl,
    weeklyRealisedPnl,
    openRisk,
    openPositions: open.length,
    tradesToday: todays.length,
    losingTradesToday,
    winningTradesToday,
    riskUsed,
    riskBudgetLeft: Math.max(0, settings.maxDailyLoss - Math.max(0, -realisedPnl) - openRisk),
    lossBudgetLeft: Math.max(0, settings.maxDailyLoss + Math.min(0, realisedPnl)),
    tradesLeft: Math.max(0, settings.maxTradesPerDay - todays.length),
    locked: lockReasons.length > 0,
    lockReasons,
    equity: settings.capital + trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
  };
}

export function validateSignalRisk(signal: Signal, settings: Settings, risk: RiskState, now = new Date()): RiskDecision {
  const reasons: string[] = [];
  if (!settings.tradingEnabled) reasons.push("Trading is disabled.");
  if (!inSession(now, settings)) reasons.push("Outside configured trading session.");
  if (risk.locked) reasons.push(...risk.lockReasons);
  if (risk.openPositions >= settings.maxOpenPositions) reasons.push("Maximum open-position cap reached.");
  if (risk.tradesToday >= settings.maxTradesPerDay) reasons.push("Maximum trades/day cap reached.");
  if (risk.weeklyRealisedPnl <= -settings.weeklyLossLimit) reasons.push("Weekly loss limit reached.");
  if (signal.quantity <= 0) reasons.push("Position size is zero.");
  if (!Number.isFinite(signal.riskRupees) || signal.riskRupees <= 0) reasons.push("Invalid trade risk.");
  if (signal.riskRupees > settings.maxRiskPerTrade) reasons.push("Risk ₹" + signal.riskRupees + " exceeds the ₹" + settings.maxRiskPerTrade + " per-trade cap.");
  if (!Number.isFinite(signal.riskReward) || signal.riskReward < settings.minRiskReward) reasons.push("R:R " + signal.riskReward + " is below the minimum " + settings.minRiskReward + ".");
  if (!Number.isFinite(signal.entry) || !Number.isFinite(signal.stopLoss) || signal.entry <= 0 || signal.stopLoss <= 0) reasons.push("Invalid entry or stop.");
  if (signal.side === "LONG" && signal.stopLoss >= signal.entry) reasons.push("LONG stop-loss must be below entry.");
  if (signal.side === "SHORT" && signal.stopLoss <= signal.entry) reasons.push("SHORT stop-loss must be above entry.");
  const calculatedRisk = Number.isFinite(signal.entry) && Number.isFinite(signal.stopLoss) && Number.isInteger(signal.quantity)
    ? Math.abs(signal.entry - signal.stopLoss) * signal.quantity
    : Number.NaN;
  if (!Number.isFinite(calculatedRisk) || Math.abs(signal.riskRupees - calculatedRisk) > 0.01) {
    reasons.push("Declared trade risk does not match entry, stop-loss and quantity.");
  }
  return { allowed: reasons.length === 0, reasons: [...new Set(reasons)] };
}
