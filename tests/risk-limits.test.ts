import { describe, expect, test } from "bun:test";
import { calculateRiskState } from "../src/lib/trading/risk-engine";
import { getServerRiskPolicy, validateServerOrderIntent } from "../src/lib/trading/server-risk";
import { DEFAULT_SETTINGS } from "../src/lib/trading/store";
import type { Trade } from "../src/lib/trading/types";
import { enforceProfile } from "../src/lib/trading/safe-settings";

const now = new Date("2026-10-28T04:30:00Z");
const trade = (id: string, pnl?: number, openedAt = now.toISOString()): Trade => ({
  id,
  signalId: id,
  symbol: "TEST",
  name: "Test",
  side: "LONG",
  entry: 100,
  stopLoss: 99,
  target1: 102,
  quantity: 100,
  status: pnl === undefined ? "OPEN" : "CLOSED",
  openedAt,
  closedAt: pnl === undefined ? undefined : now.toISOString(),
  pnl,
  notes: "",
  simulated: true,
});

describe("capital-preservation limits", () => {
  test("saved configuration cannot raise the ₹500 risk ceiling", () => {
    expect(enforceProfile({ ...DEFAULT_SETTINGS, maxRiskPerTrade: 9999 }).maxRiskPerTrade).toBe(
      500,
    );
  });
  test("saved configuration cannot raise the ₹1,000 daily ceiling", () => {
    expect(enforceProfile({ ...DEFAULT_SETTINGS, maxDailyLoss: 9999 }).maxDailyLoss).toBe(1000);
  });
  test("saved configuration cannot raise the three-trade ceiling", () => {
    expect(enforceProfile({ ...DEFAULT_SETTINGS, maxTradesPerDay: 10 }).maxTradesPerDay).toBe(3);
  });
  test("saved configuration cannot remove the two-loss lock", () => {
    expect(
      enforceProfile({ ...DEFAULT_SETTINGS, lockAfterLosingTrades: 10 }).lockAfterLosingTrades,
    ).toBe(2);
  });
  test("starting profile has ₹1,00,000 capital and ₹500 risk cap", () => {
    expect(DEFAULT_SETTINGS.capital).toBe(100000);
    expect(DEFAULT_SETTINGS.maxRiskPerTrade).toBe(500);
  });
  test("₹1,000 daily loss locks trading", () => {
    const state = calculateRiskState([trade("loss", -1000)], DEFAULT_SETTINGS, now);
    expect(state.lockReasons).toContain("Daily loss limit hit (₹1000).");
  });
  test("three trades per day locks trading", () => {
    const state = calculateRiskState(
      [trade("a", 100), trade("b", 100), trade("c", 100)],
      DEFAULT_SETTINGS,
      now,
    );
    expect(state.lockReasons).toContain("Maximum 3 trades/day reached.");
  });
  test("two losing trades lock even with a win between them", () => {
    const state = calculateRiskState(
      [trade("a", -100), trade("b", 200), trade("c", -100)],
      DEFAULT_SETTINGS,
      now,
    );
    expect(state.lockReasons).toContain("2 losing trades today (limit 2).");
  });
  test("two open positions count even when opened before today", () => {
    const state = calculateRiskState(
      [trade("a", undefined, "2026-10-27T04:30:00Z"), trade("b")],
      DEFAULT_SETTINGS,
      now,
    );
    expect(state.openPositions).toBe(2);
    expect(state.openRisk).toBe(200);
    expect(state.lockReasons).toContain("Maximum 2 open positions reached.");
  });
  test("₹2,500 rolling weekly loss locks trading", () => {
    expect(calculateRiskState([trade("a", -2500)], DEFAULT_SETTINGS, now).lockReasons).toContain(
      "7-day loss limit hit (₹2500).",
    );
  });

  test("server environment cannot loosen immutable paper risk ceilings", () => {
    const names = [
      "RISK_MAX_PER_TRADE",
      "RISK_MAX_DAILY_LOSS",
      "RISK_MAX_WEEKLY_LOSS",
      "RISK_MAX_TRADES_PER_DAY",
      "RISK_MAX_OPEN_POSITIONS",
      "RISK_MIN_RR",
    ];
    const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    try {
      process.env["RISK_MAX_PER_TRADE"] = "50000";
      process.env["RISK_MAX_DAILY_LOSS"] = "50000";
      process.env["RISK_MAX_WEEKLY_LOSS"] = "50000";
      process.env["RISK_MAX_TRADES_PER_DAY"] = "50";
      process.env["RISK_MAX_OPEN_POSITIONS"] = "50";
      process.env["RISK_MIN_RR"] = "0.1";
      const policy = getServerRiskPolicy();
      expect(policy.maxRiskPerTrade).toBe(500);
      expect(policy.maxDailyLoss).toBe(1000);
      expect(policy.maxWeeklyLoss).toBe(2500);
      expect(policy.maxTradesPerDay).toBe(3);
      expect(policy.maxOpenPositions).toBe(2);
      expect(policy.minRiskReward).toBe(1.5);
    } finally {
      for (const name of names) {
        const value = original[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  test("server paper risk gate blocks position value above ₹1,00,000", () => {
    const decision = validateServerOrderIntent(
      {
        signalId: "signal-1",
        symbol: "TEST",
        side: "BUY",
        quantity: 100,
        entry: 1001,
        stopLoss: 996,
        riskRupees: 500,
        riskReward: 1.5,
        exchangeSegment: "NSE_EQ",
        productType: "INTRADAY",
        securityId: "12345",
      },
      {
        maxRiskPerTrade: 500,
        maxDailyLoss: 1000,
        maxWeeklyLoss: 2500,
        maxTradesPerDay: 3,
        maxOpenPositions: 2,
        minRiskReward: 1.5,
        sessionStart: "09:00",
        sessionEnd: "15:30",
        tradingEnabled: true,
      },
      new Date("2026-11-23T05:00:00.000Z"),
      { requireLiveReady: false },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain(
      "Position value exceeds the ₹1,00,000 paper capital cap.",
    );
  });

  test("equity intraday profile forbids F&O and live execution", () => {
    expect(DEFAULT_SETTINGS.intradayOnly).toBe(true);
    expect(DEFAULT_SETTINGS.allowFno).toBe(false);
    expect(DEFAULT_SETTINGS.liveExecutionEnabled).toBe(false);
  });
});
