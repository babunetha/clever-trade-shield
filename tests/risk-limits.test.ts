import { describe, expect, test } from "bun:test";
import { calculateRiskState } from "../src/lib/trading/risk-engine";
import { DEFAULT_SETTINGS } from "../src/lib/trading/store";
import type { Trade } from "../src/lib/trading/types";

const now = new Date("2026-10-28T04:30:00Z");
const trade = (id: string, pnl?: number, openedAt = now.toISOString()): Trade => ({
  id, signalId: id, symbol: "TEST", name: "Test", side: "LONG", entry: 100,
  stopLoss: 99, target1: 102, quantity: 100, status: pnl === undefined ? "OPEN" : "CLOSED",
  openedAt, closedAt: pnl === undefined ? undefined : now.toISOString(), pnl, notes: "", simulated: true,
});

describe("capital-preservation limits", () => {
  test("starting profile has ₹1,00,000 capital and ₹500 risk cap", () => {
    expect(DEFAULT_SETTINGS.capital).toBe(100000);
    expect(DEFAULT_SETTINGS.maxRiskPerTrade).toBe(500);
  });
  test("₹1,000 daily loss locks trading", () => {
    const state = calculateRiskState([trade("loss", -1000)], DEFAULT_SETTINGS, now);
    expect(state.lockReasons).toContain("Daily loss limit hit (₹1000).");
  });
  test("three trades per day locks trading", () => {
    const state = calculateRiskState([trade("a", 100), trade("b", 100), trade("c", 100)], DEFAULT_SETTINGS, now);
    expect(state.lockReasons).toContain("Maximum 3 trades/day reached.");
  });
  test("two losing trades lock even with a win between them", () => {
    const state = calculateRiskState([trade("a", -100), trade("b", 200), trade("c", -100)], DEFAULT_SETTINGS, now);
    expect(state.lockReasons).toContain("2 losing trades today (limit 2).");
  });
  test("two open positions count even when opened before today", () => {
    const state = calculateRiskState([trade("a", undefined, "2026-10-27T04:30:00Z"), trade("b")], DEFAULT_SETTINGS, now);
    expect(state.openPositions).toBe(2);
    expect(state.openRisk).toBe(200);
    expect(state.lockReasons).toContain("Maximum 2 open positions reached.");
  });
  test("₹2,500 rolling weekly loss locks trading", () => {
    expect(calculateRiskState([trade("a", -2500)], DEFAULT_SETTINGS, now).lockReasons).toContain("7-day loss limit hit (₹2500).");
  });
  test("equity intraday profile forbids F&O and live execution", () => {
    expect(DEFAULT_SETTINGS.intradayOnly).toBe(true);
    expect(DEFAULT_SETTINGS.allowFno).toBe(false);
    expect(DEFAULT_SETTINGS.liveExecutionEnabled).toBe(false);
  });
});