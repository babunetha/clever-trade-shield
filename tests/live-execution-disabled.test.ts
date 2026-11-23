import { describe, expect, test } from "bun:test";
import {
  cancelLiveDhanOrder,
  liveExecutionGate,
  placeLiveDhanOrder,
} from "../src/lib/dhan-live-execution.server";

describe("research-only execution boundary", () => {
  test("live execution gate remains closed", () => {
    expect(liveExecutionGate().enabled).toBe(false);
  });

  test("order placement returns disabled without contacting Dhan", async () => {
    const result = await placeLiveDhanOrder({
      dhanClientId: "test-client",
      correlationId: "CTS_TEST",
      transactionType: "BUY",
      exchangeSegment: "NSE_EQ",
      productType: "INTRADAY",
      orderType: "MARKET",
      securityId: "12345",
      quantity: 1,
      validity: "DAY",
    });
    expect(result.placed).toBe(false);
    expect(result.code).toBe("DISABLED");
  });

  test("order cancellation returns disabled without contacting Dhan", async () => {
    const result = await cancelLiveDhanOrder("123456789");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("DISABLED");
  });
});
