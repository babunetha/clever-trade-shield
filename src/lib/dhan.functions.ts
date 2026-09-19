import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";

/** Returns broker wiring status as booleans only — no secrets cross the wire. */
export const getDhanStatus = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async () => {
  const { readDhanCredentialStatus } = await import("./dhan.server");
  return readDhanCredentialStatus();
});

/** Authenticated connection test against GET /v2/profile. Client id is masked. */
export const testDhanConnection = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async () => {
  const { testDhanConnection: run } = await import("./dhan.server");
  return run();
});

/** Read-only account snapshot: funds + holdings + positions in one round trip. */
export const getDhanAccount = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async () => {
  const { getDhanFunds, getDhanHoldings, getDhanPositions } = await import("./dhan.server");
  const [funds, holdings, positions] = await Promise.all([getDhanFunds(), getDhanHoldings(), getDhanPositions()]);
  return { funds, holdings, positions };
});

/** Live LTP for a small list of NSE cash security ids (Data API subscription required). */
export const getDhanQuotes = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: { securityIds: string[] }) => ({
    securityIds: (Array.isArray(input?.securityIds) ? input.securityIds : [])
      .map((id) => String(id).trim())
      .filter((id) => /^\d{1,8}$/.test(id))
      .slice(0, 1000),
  }))
  .handler(async ({ data }) => {
    const { getDhanLtp } = await import("./dhan.server");
    return getDhanLtp({ securityIds: data.securityIds, exchangeSegment: "NSE_EQ" });
  });

/** Always refuses in v1; kept so the UI can prove the kill-switch works. */
export const submitApprovedTrade = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: { signalId: string }) => input)
  .handler(async ({ data }) => {
    const { placeDhanOrder } = await import("./dhan.server");
    const result = await placeDhanOrder({
      symbol: data.signalId,
      side: "BUY",
      quantity: 0,
      price: 0,
      stopLoss: 0,
      productType: "INTRADAY",
    });
    return result;
  });


/** Historical intraday candles. Server-only; credentials never cross the browser boundary. */
export const getDhanHistoricalCandles = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: {
    securityId: string;
    exchangeSegment: "NSE_EQ" | "BSE_EQ";
    fromDate: string;
    toDate: string;
    interval?: "1" | "5" | "15" | "25" | "60";
  }) => input)
  .handler(async ({ data }) => {
    const { getDhanHistoricalCandles: run } = await import("./dhan.server");
    return run({
      securityId: data.securityId,
      exchangeSegment: data.exchangeSegment,
      instrument: "EQUITY",
      fromDate: data.fromDate,
      toDate: data.toDate,
      interval: data.interval ?? "5",
    });
  });


/** Read-only LTP snapshot from Dhan. */
export const getDhanLtp = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: { securityIds: string[]; exchangeSegment?: "NSE_EQ" | "BSE_EQ" }) => ({
    securityIds: input.securityIds.slice(0, 1000),
    exchangeSegment: input.exchangeSegment ?? "NSE_EQ",
  }))
  .handler(async ({ data }) => {
    const { getDhanLtp: run } = await import("./dhan.server");
    return run(data);
  });


/** Read-only broker reconciliation snapshot. No order mutation is performed. */
export const getDhanReconciliation = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .handler(async () => {
    const { getDhanOrders, getDhanTrades, getDhanPositions } = await import("./dhan.server");
    const [orders, trades, positions] = await Promise.all([getDhanOrders(), getDhanTrades(), getDhanPositions()]);
    return { orders, trades, positions, asOf: new Date().toISOString() };
  });
