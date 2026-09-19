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

export const SERVER_LIVE_EXECUTION_READY = false as const;

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
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

export function validateServerOrderIntent(intent: ServerOrderIntent, policy = getServerRiskPolicy(), now = new Date()) {
  const reasons: string[] = [];
  const current = now.getHours() * 60 + now.getMinutes();

  if (!SERVER_LIVE_EXECUTION_READY) reasons.push("Server live-execution readiness gate is OFF.");
  if (!policy.tradingEnabled) reasons.push("Server trading switch is OFF.");
  if (current < timeMinutes(policy.sessionStart) || current > timeMinutes(policy.sessionEnd)) reasons.push("Outside server trading session.");
  if (!Number.isInteger(intent.quantity) || intent.quantity <= 0) reasons.push("Invalid quantity.");
  if (!Number.isFinite(intent.entry) || intent.entry <= 0) reasons.push("Invalid entry price.");
  if (!Number.isFinite(intent.stopLoss) || intent.stopLoss <= 0) reasons.push("Invalid stop-loss.");
  if (!Number.isFinite(intent.riskRupees) || intent.riskRupees <= 0 || intent.riskRupees > policy.maxRiskPerTrade) reasons.push("Per-trade risk exceeds server cap.");
  if (!Number.isFinite(intent.riskReward) || intent.riskReward < policy.minRiskReward) reasons.push("Risk/reward is below server minimum.");
  if (!intent.symbol.trim() || !intent.signalId.trim()) reasons.push("Missing signal identity.");
  if (intent.productType !== "INTRADAY") reasons.push("Only INTRADAY is allowed by the server policy.");
  return { allowed: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function findDuplicateCorrelationId(orders: DhanOrderSummary[], correlationId: string) {
  return orders.find((order) => order.correlationId === correlationId) ?? null;
}
