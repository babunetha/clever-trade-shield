import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";

/** Returns broker wiring status as booleans only — no secrets cross the wire. */
export const getDhanStatus = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async () => {
  const { readDhanCredentialStatus } = await import("./dhan.server");
  return readDhanCredentialStatus();
});

export const testDhanConnection = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async () => {
  const { testDhanConnection: run } = await import("./dhan.server");
  return run();
});

export const getDhanAccount = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async () => {
  const { getDhanFunds, getDhanHoldings, getDhanPositions } = await import("./dhan.server");
  const [funds, holdings, positions] = await Promise.all([getDhanFunds(), getDhanHoldings(), getDhanPositions()]);
  return { funds, holdings, positions };
});

export const getDhanQuotes = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: { securityIds: string[] }) => ({
    securityIds: (Array.isArray(input?.securityIds) ? input.securityIds : []).map(String).map((id) => id.trim()).filter((id) => /^\d{1,8}$/.test(id)).slice(0, 1000),
  }))
  .handler(async ({ data }) => {
    const { getDhanLtp } = await import("./dhan.server");
    return getDhanLtp({ securityIds: data.securityIds, exchangeSegment: "NSE_EQ" });
  });

/**
 * Creates a durable order intent before any future execution path.
 * Idempotency is enforced by the database unique constraint.
 * Live transmission remains hard-disabled.
 */
export const submitApprovedTrade = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: {
    idempotencyKey: string;
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
    idempotencyKey: String(input.idempotencyKey ?? "").trim().slice(0, 100),
    signalId: String(input.signalId ?? "").trim().slice(0, 64),
    symbol: String(input.symbol ?? "").trim().toUpperCase().slice(0, 30),
    exchangeSegment: input.exchangeSegment ?? "NSE_EQ",
  }))
  .handler(async ({ data }) => {
    const { validateServerOrderIntent } = await import("./trading/server-risk");
    const { createOrderIntent, getOrderIntentByIdempotencyKey, recordRiskEvent } = await import("./supabase.server");

    if (!data.idempotencyKey) {
      return { placed: false as const, reason: "Missing idempotency key." };
    }

    const existing = await getOrderIntentByIdempotencyKey(data.idempotencyKey);
    if (existing) {
      return { placed: false as const, reason: `Duplicate approval blocked. Existing intent status: ${existing.status}.`, intentId: existing.id };
    }

    const decision = validateServerOrderIntent({
      ...data,
      productType: "INTRADAY",
      exchangeSegment: data.exchangeSegment,
    });

    const status = decision.allowed ? "APPROVED" : "REJECTED";
    const correlationId = `CTS_${data.idempotencyKey.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 25)}`;

    const intent = await createOrderIntent({
      idempotency_key: data.idempotencyKey,
      signal_id: data.signalId,
      symbol: data.symbol,
      exchange_segment: data.exchangeSegment,
      transaction_type: data.side,
      quantity: data.quantity,
      order_type: "MARKET",
      product_type: "INTRADAY",
      entry_price: data.entry,
      stop_loss: data.stopLoss,
      declared_risk: data.riskRupees,
      status,
      broker_correlation_id: correlationId,
    });

    if (!decision.allowed) {
      await recordRiskEvent({
        event_type: "ORDER_BLOCKED",
        severity: "BLOCK",
        signal_id: data.signalId,
        symbol: data.symbol,
        idempotency_key: data.idempotencyKey,
        reason: decision.reasons.join("; "),
        details: { intentId: intent.id },
      });
      return { placed: false as const, reason: "Server risk gate blocked the request: " + decision.reasons.join("; "), intentId: intent.id };
    }

    await recordRiskEvent({
      event_type: "ORDER_APPROVED",
      severity: "INFO",
      signal_id: data.signalId,
      symbol: data.symbol,
      idempotency_key: data.idempotencyKey,
      reason: "Order intent passed server risk validation.",
      details: { intentId: intent.id, liveExecutionEnabled: false },
    });

    return {
      placed: false as const,
      reason: "Approval recorded durably. Live execution remains disabled; no order was transmitted to Dhan.",
      intentId: intent.id,
      correlationId,
    };
  });

export const getDhanHistoricalCandles = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: { securityId: string; exchangeSegment: "NSE_EQ" | "BSE_EQ"; fromDate: string; toDate: string; interval?: "1" | "5" | "15" | "25" | "60" }) => {
    const securityId = String(input?.securityId ?? "").trim();
    const fromDate = String(input?.fromDate ?? "").trim();
    const toDate = String(input?.toDate ?? "").trim();
    if (!/^\d{1,8}$/.test(securityId)) throw new Error("Invalid Dhan security ID.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw new Error("Dates must use YYYY-MM-DD format.");
    if (fromDate > toDate) throw new Error("fromDate cannot be after toDate.");
    return { securityId, exchangeSegment: input.exchangeSegment, fromDate, toDate, interval: input.interval ?? "5" };
  })
  .handler(async ({ data }) => {
    const { getDhanHistoricalCandles: run } = await import("./dhan.server");
    return run({ ...data, instrument: "EQUITY" });
  });

export const getDhanLtp = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: { securityIds: string[]; exchangeSegment?: "NSE_EQ" | "BSE_EQ" }) => ({
    securityIds: (Array.isArray(input?.securityIds) ? input.securityIds : []).map(String).map((id) => id.trim()).filter((id) => /^\d{1,8}$/.test(id)).slice(0, 1000),
    exchangeSegment: input.exchangeSegment ?? "NSE_EQ",
  }))
  .handler(async ({ data }) => {
    const { getDhanLtp: run } = await import("./dhan.server");
    return run(data);
  });

/**
 * Reconciles the broker's authoritative daily order/trade books into Supabase.
 * This is intentionally read-only against Dhan and can be safely repeated.
 */
export const getDhanReconciliation = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .handler(async () => {
    const { getDhanOrders, getDhanTrades, getDhanPositions } = await import("./dhan.server");
    const { upsertBrokerOrder, upsertBrokerTrade } = await import("./supabase.server");
    const [orders, trades, positions] = await Promise.all([getDhanOrders(), getDhanTrades(), getDhanPositions()]);

    if (orders.ok) {
      for (const order of orders.data) {
        await upsertBrokerOrder({
          broker_order_id: order.orderId,
          correlation_id: order.correlationId || null,
          status: order.orderStatus,
          transaction_type: order.transactionType || null,
          symbol: order.tradingSymbol || null,
          quantity: order.quantity,
          filled_quantity: order.filledQuantity,
          average_price: order.averageTradedPrice || null,
          raw_payload: order,
          last_seen_at: new Date().toISOString(),
        });
      }
    }

    if (trades.ok) {
      for (const trade of trades.data) {
        await upsertBrokerTrade({
          broker_trade_id: trade.exchangeTradeId,
          broker_order_id: trade.orderId || null,
          symbol: trade.tradingSymbol,
          transaction_type: trade.transactionType,
          quantity: trade.tradedQuantity,
          price: trade.tradedPrice,
          trade_time: trade.updateTime || null,
          raw_payload: trade,
        });
      }
    }

    return { orders, trades, positions, asOf: new Date().toISOString(), persisted: true };
  });
