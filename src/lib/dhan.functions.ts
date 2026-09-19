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
  .inputValidator((input: {
    signalId: string;
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    entry: number;
    stopLoss: number;
    riskRupees: number;
    riskReward: number;
    exchangeSegment?: "NSE_EQ" | "BSE_EQ";
  }) => ({
    ...input,
    signalId: String(input.signalId ?? "").trim().slice(0, 64),
    symbol: String(input.symbol ?? "").trim().toUpperCase().slice(0, 30),
    exchangeSegment: input.exchangeSegment ?? "NSE_EQ",
  }))
  .handler(async ({ data }) => {
    const { validateServerOrderIntent } = await import("./trading/server-risk");
    const decision = validateServerOrderIntent({
      ...data,
      productType: "INTRADAY",
      exchangeSegment: data.exchangeSegment,
    });
    if (!decision.allowed) {
      return { placed: false as const, reason: "Server risk gate blocked the request: " + decision.reasons.join("; ") };
    }
    return { placed: false as const, reason: "Live execution remains disabled. No order was transmitted to Dhan." };
  });


/** Historical intraday candles. Server-only; credentials never cross the browser boundary. */
export const getDhanHistoricalCandles = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: {
    securityId: string;
    exchangeSegment: "NSE_EQ" | "BSE_EQ";
    fromDate: string;
    toDate: string;
    interval?: "1" | "5" | "15" | "25" | "60";
  }) => {
    const securityId = String(input?.securityId ?? "").trim();
    const fromDate = String(input?.fromDate ?? "").trim();
    const toDate = String(input?.toDate ?? "").trim();
    if (!/^\\d{1,8}$/.test(securityId)) throw new Error("Invalid Dhan security ID.");
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(fromDate) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(toDate)) {
      throw new Error("Dates must use YYYY-MM-DD format.");
    }
    if (fromDate > toDate) throw new Error("fromDate cannot be after toDate.");
    return {
      securityId,
      exchangeSegment: input.exchangeSegment,
      fromDate,
      toDate,
      interval: input.interval ?? "5",
    };
  })
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
    securityIds: (Array.isArray(input?.securityIds) ? input.securityIds : [])
      .map((id) => String(id).trim())
      .filter((id) => /^\\d{1,8}$/.test(id))
      .slice(0, 1000),
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
