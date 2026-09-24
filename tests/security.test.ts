import { describe, expect, test } from "bun:test";
import { LIVE_EXECUTION_ENABLED, placeDhanOrder } from "../src/lib/dhan.server";
import { DisabledLiveExecutionAdapter, executionAdapterFor } from "../src/lib/trading/execution";
import { calculateRiskState, validateSignalRisk } from "../src/lib/trading/risk-engine";
import { DEFAULT_SETTINGS } from "../src/lib/trading/store";
import { SERVER_LIVE_EXECUTION_READY, validateServerOrderIntent } from "../src/lib/trading/server-risk";

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
    expect(SERVER_LIVE_EXECUTION_READY).toBe(false);
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

  test("paper execution rejects invalid quantity without side effects", async () => {
    const adapter = executionAdapterFor("PAPER");
    const result = await adapter.place({
      symbol: "TEST",
      side: "BUY",
      quantity: 0,
      entryPrice: 100,
      stopLoss: 99,
      target1: 102,
      productType: "INTRADAY",
    });
    expect(result.accepted).toBe(false);
    expect(result.orderId).toBeUndefined();
  });

  test("paper cancellation is deterministic", async () => {
    const adapter = executionAdapterFor("PAPER");
    const result = await adapter.cancel("PAPER-TEST");
    expect(result.accepted).toBe(true);
    expect(result.orderId).toBe("PAPER-TEST");
  });

  test("disabled live cancellation cannot reach a broker", async () => {
    const adapter = executionAdapterFor("LIVE_AUTO");
    const result = await adapter.cancel("LIVE-TEST");
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("Live execution is disabled");
  });
});

describe("risk guardrails", () => {
  test("server trading switch fails closed by default", async () => {
    const previous = process.env.RISK_TRADING_ENABLED;
    delete process.env.RISK_TRADING_ENABLED;
    const { getServerRiskPolicy } = await import("../src/lib/trading/server-risk");
    expect(getServerRiskPolicy().tradingEnabled).toBe(false);
    if (previous === undefined) delete process.env.RISK_TRADING_ENABLED;
    else process.env.RISK_TRADING_ENABLED = previous;
  });
  test("blocks a trade above the per-trade risk cap", () => {
    const settings = { ...DEFAULT_SETTINGS };
    const risk = calculateRiskState([], settings, new Date("2026-09-19T10:00:00+05:30"));
    expect(validateSignalRisk(signal({ riskRupees: 1000 }), settings, risk, new Date("2026-09-19T10:00:00+05:30")).allowed).toBe(false);
  });

  test("blocks outside the configured trading session using India time", () => {
    const settings = { ...DEFAULT_SETTINGS };
    const atOpen = new Date("2026-09-19T03:45:00Z"); // 09:15 IST
    const risk = calculateRiskState([], settings, atOpen);
    expect(validateSignalRisk(signal(), settings, risk, atOpen).allowed).toBe(false);
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

  test("blocks a long signal whose declared risk does not match the position", () => {
    const settings = { ...DEFAULT_SETTINGS };
    const risk = calculateRiskState([], settings, new Date("2026-09-19T10:00:00+05:30"));
    expect(validateSignalRisk(signal({ riskRupees: 0.5 }), settings, risk, new Date("2026-09-19T10:00:00+05:30")).allowed).toBe(false);
  });

  test("blocks a long signal with an invalid stop direction", () => {
    const settings = { ...DEFAULT_SETTINGS };
    const risk = calculateRiskState([], settings, new Date("2026-09-19T10:00:00+05:30"));
    expect(validateSignalRisk(signal({ stopLoss: 101, riskRupees: 1 }), settings, risk, new Date("2026-09-19T10:00:00+05:30")).allowed).toBe(false);
  });

  test("server gate rejects mismatched declared risk", () => {
    const decision = validateServerOrderIntent({
      signalId: "SECURITY-TEST",
      symbol: "TEST",
      side: "BUY",
      quantity: 10,
      entry: 100,
      stopLoss: 99,
      riskRupees: 1,
      riskReward: 2,
      exchangeSegment: "NSE_EQ",
      productType: "INTRADAY",
      securityId: "11536",
    }, undefined, new Date("2026-09-19T04:00:00Z"));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("Server live-execution readiness gate is OFF.");
    expect(decision.reasons).toContain("Declared trade risk does not match entry, stop-loss and quantity.");
  });
});


describe("production execution gate", () => {
  test("live gate is closed unless every production condition is explicitly configured", async () => {
    const { liveExecutionGate } = await import("../src/lib/dhan-live-execution.server");
    const gate = liveExecutionGate();
    expect(gate.enabled).toBe(false);
    expect(gate.reasons.length).toBeGreaterThan(0);
  });

  test("order state machine rejects terminal-state resurrection", async () => {
    const { transitionOrderStatus } = await import("../src/lib/trading/order-state-machine");
    expect(transitionOrderStatus("FILLED", "FILLED")).toBe("FILLED");
    expect(transitionOrderStatus("FILLED", "CANCELLED")).toBe("FILLED");
  });

  test("partial fill status is supported", async () => {
    const { transitionOrderStatus } = await import("../src/lib/trading/order-state-machine");
    expect(transitionOrderStatus("SUBMITTED", "PARTIALLY_FILLED")).toBe("PARTIALLY_FILLED");
    expect(transitionOrderStatus("PARTIALLY_FILLED", "FILLED")).toBe("FILLED");
  });
});
