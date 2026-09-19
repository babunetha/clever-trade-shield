import type { DhanOrderSummary } from "../dhan.server";

export interface ServerOrderIntent {
  signalId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entry: number;
  stopLoss: number;
  riskRupees: number;
  riskReward: number;
  exchangeSegment: "NSE_EQ" | "BSE_EQ";
  productType: "INTRADAY";
  securityId: string;
}

export interface ServerRiskPolicy {
  maxRiskPerTrade: number;
  maxDailyLoss: number;
  maxWeeklyLoss: number;
  maxTradesPerDay: number;
  maxOpenPositions: number;
  minRiskReward: number;
  sessionStart: string;
  sessionEnd: string;
  tradingEnabled: boolean;
}

export const SERVER_LIVE_EXECUTION_READY = process.env["CTS_LIVE_EXECUTION_ENABLED"] === "true" && process.env["CTS_LIVE_EXECUTION_CONFIRMATION"] === "ENABLE_LIVE_TRADING" as const;

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return Number.NaN;
  }
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

export function getServerRiskPolicy(): ServerRiskPolicy {
  return {
    maxRiskPerTrade: numberEnv("RISK_MAX_PER_TRADE", 500),
    maxDailyLoss: numberEnv("RISK_MAX_DAILY_LOSS", 1000),
    maxWeeklyLoss: numberEnv("RISK_MAX_WEEKLY_LOSS", 2500),
    maxTradesPerDay: numberEnv("RISK_MAX_TRADES_PER_DAY", 3),
    maxOpenPositions: numberEnv("RISK_MAX_OPEN_POSITIONS", 2),
    minRiskReward: numberEnv("RISK_MIN_RR", 1.5),
    sessionStart: process.env["RISK_SESSION_START"] ?? "09:20",
    sessionEnd: process.env["RISK_SESSION_END"] ?? "15:10",
    tradingEnabled: process.env["RISK_TRADING_ENABLED"] !== "false",
  };
}

export function validateServerOrderIntent(intent: ServerOrderIntent, policy = getServerRiskPolicy(), now = new Date(), options: { requireLiveReady?: boolean } = {}) {
  const reasons: string[] = [];
  const current = indiaMinutes(now);
  const start = timeMinutes(policy.sessionStart);
  const end = timeMinutes(policy.sessionEnd);

  if (options.requireLiveReady !== false && !SERVER_LIVE_EXECUTION_READY) reasons.push("Server live-execution readiness gate is OFF.");
  if (!policy.tradingEnabled) reasons.push("Server trading switch is OFF.");
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    reasons.push("Server trading session configuration is invalid.");
  } else if (current < start || current > end) {
    reasons.push("Outside server trading session.");
  }
  if (!Number.isInteger(intent.quantity) || intent.quantity <= 0) reasons.push("Invalid quantity.");
  if (!Number.isFinite(intent.entry) || intent.entry <= 0) reasons.push("Invalid entry price.");
  if (!Number.isFinite(intent.stopLoss) || intent.stopLoss <= 0) reasons.push("Invalid stop-loss.");
  if (intent.side === "BUY" && Number.isFinite(intent.entry) && Number.isFinite(intent.stopLoss) && intent.stopLoss >= intent.entry) {
    reasons.push("BUY stop-loss must be below entry.");
  }
  if (intent.side === "SELL" && Number.isFinite(intent.entry) && Number.isFinite(intent.stopLoss) && intent.stopLoss <= intent.entry) {
    reasons.push("SELL stop-loss must be above entry.");
  }
  const calculatedRisk = Number.isFinite(intent.entry) && Number.isFinite(intent.stopLoss) && Number.isInteger(intent.quantity)
    ? Math.abs(intent.entry - intent.stopLoss) * intent.quantity
    : Number.NaN;
  if (!Number.isFinite(calculatedRisk) || Math.abs(intent.riskRupees - calculatedRisk) > 0.01) {
    reasons.push("Declared trade risk does not match entry, stop-loss and quantity.");
  }
  if (!Number.isFinite(intent.riskRupees) || intent.riskRupees <= 0 || intent.riskRupees > policy.maxRiskPerTrade) {
    reasons.push("Per-trade risk exceeds server cap.");
  }
  if (!Number.isFinite(intent.riskReward) || intent.riskReward < policy.minRiskReward) reasons.push("Risk/reward is below server minimum.");
  if (!intent.symbol.trim() || !intent.signalId.trim()) reasons.push("Missing signal identity.");
  if (!/^\d{1,8}$/.test(intent.securityId)) reasons.push("Missing or invalid Dhan security ID.");
  if (intent.productType !== "INTRADAY") reasons.push("Only INTRADAY is allowed by the server policy.");
  return { allowed: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function findDuplicateCorrelationId(orders: DhanOrderSummary[], correlationId: string) {
  return orders.find((order) => order.correlationId === correlationId) ?? null;
}
