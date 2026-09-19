import { describe, expect, test } from "bun:test";
import { LIVE_EXECUTION_ENABLED, placeDhanOrder } from "../src/lib/dhan.server";
import { DisabledLiveExecutionAdapter, executionAdapterFor } from "../src/lib/trading/execution";
import { calculateRiskState, validateSignalRisk } from "../src/lib/trading/risk-engine";
import { DEFAULT_SETTINGS } from "../src/lib/trading/store";

const signal = (overrides: Record<string, unknown> = {}) => ({
  id: "SECURITY-TEST",
  symbol: "TEST",
  name: "Test",
  side: "LONG" as const,
  ltp: 100,
  entry: 100,
  stopLoss: 99,
  target1: 102,
  target2: 103,
  quantity: 1,
  riskRupees: 1,
  rewardRupees: 2,
  riskReward: 2,
  confidence: 80,
  score: 80,
  rationale: [],
  indicators: {} as never,
  niftyBias: "NEUTRAL" as const,
  bankNiftyBias: "NEUTRAL" as const,
  generatedAt: "2026-09-19T10:00:00.000Z",
  expiresAt: "2026-09-19T10:05:00.000Z",
  status: "PENDING" as const,
  ...overrides,
});

describe("live execution safety", () => {
  test("Dhan live execution is hard-disabled", async () => {
    expect(LIVE_EXECUTION_ENABLED).toBe(false);
    const result = await placeDhanOrder({
      symbol: "TEST",
      side: "BUY",
      quantity: 1,
      price: 100,
      stopLoss: 99,
      productType: "INTRADAY",
    });
    expect(result.placed).toBe(false);
  });

  test("non-paper modes cannot select a live adapter", () => {
    expect(executionAdapterFor("SEMI_AUTO")).toBeInstanceOf(DisabledLiveExecutionAdapter);
    expect(executionAdapterFor("LIVE_AUTO")).toBeInstanceOf(DisabledLiveExecutionAdapter);
  });
});

describe("risk guardrails", () => {
  test("blocks a trade above the per-trade risk cap", () => {
    const settings = { ...DEFAULT_SETTINGS };
    const risk = calculateRiskState([], settings, new Date("2026-09-19T10:00:00"));
    expect(validateSignalRisk(signal({ riskRupees: 1000 }), settings, risk, new Date("2026-09-19T10:00:00")).allowed).toBe(false);
  });

  test("blocks outside the configured trading session", () => {
    const settings = { ...DEFAULT_SETTINGS };
    const risk = calculateRiskState([], settings, new Date("2026-09-19T08:00:00"));
    expect(validateSignalRisk(signal(), settings, risk, new Date("2026-09-19T08:00:00")).allowed).toBe(false);
  });

  test("blocks when the open-position cap is reached", () => {
    const settings = { ...DEFAULT_SETTINGS, maxOpenPositions: 1 };
    const trade = {
      id: "OPEN-1",
      signalId: "S1",
      symbol: "TEST",
      name: "Test",
      side: "LONG" as const,
      entry: 100,
      stopLoss: 99,
      target1: 102,
      quantity: 1,
      status: "OPEN" as const,
      openedAt: "2026-09-19T10:00:00+05:30",
      notes: "",
      simulated: true as const,
    };
    const risk = calculateRiskState([trade], settings, new Date("2026-09-19T10:00:00+05:30"));
    expect(validateSignalRisk(signal(), settings, risk, new Date("2026-09-19T10:00:00+05:30")).allowed).toBe(false);
  });
});
