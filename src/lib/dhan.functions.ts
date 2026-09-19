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
    securityId: string;
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
    securityId: String(input.securityId ?? "").trim(),
    exchangeSegment: input.exchangeSegment ?? "NSE_EQ",
  }))
  .handler(async ({ data }) => {
    const { validateServerOrderIntent } = await import("./trading/server-risk");
    const { placeLiveDhanOrder, liveExecutionGate, getLiveDhanOrderByCorrelationId, cancelLiveDhanOrder } = await import("./dhan-live-execution.server");
    const { createOrderIntent, getOrderIntentByIdempotencyKey, recordRiskEvent, updateOrderIntentByIdempotencyKey } = await import("./supabase.server");

    if (!data.idempotencyKey) return { placed: false as const, reason: "Missing idempotency key." };

    const existing = await getOrderIntentByIdempotencyKey(data.idempotencyKey);
    if (existing) {
      return { placed: false as const, reason: `Duplicate approval blocked. Existing intent status: ${existing.status}.`, intentId: existing.id };
    }

    const intentInput = {
      ...data,
      productType: "INTRADAY" as const,
      exchangeSegment: data.exchangeSegment,
    };

    const approvalDecision = validateServerOrderIntent(intentInput, undefined, new Date(), { requireLiveReady: false });
    const correlationId = `CTS_${data.idempotencyKey.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 25)}`;
    const status = approvalDecision.allowed ? "APPROVED" : "REJECTED";

    let intent;
    try {
      intent = await createOrderIntent({
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
    } catch {
      const duplicate = await getOrderIntentByIdempotencyKey(data.idempotencyKey);
      return { placed: false as const, reason: duplicate ? `Duplicate approval blocked. Existing intent status: ${duplicate.status}.` : "Could not create durable order intent." };
    }

    if (!approvalDecision.allowed) {
      await recordRiskEvent({
        event_type: "ORDER_BLOCKED",
        severity: "BLOCK",
        signal_id: data.signalId,
        symbol: data.symbol,
        idempotency_key: data.idempotencyKey,
        reason: approvalDecision.reasons.join("; "),
        details: { intentId: intent.id },
      });
      return { placed: false as const, reason: "Server risk gate blocked the request: " + approvalDecision.reasons.join("; "), intentId: intent.id };
    }

    const gate = liveExecutionGate();
    if (!gate.enabled) {
      await updateOrderIntentByIdempotencyKey(data.idempotencyKey, { status: "APPROVED_SHADOW" });
      await recordRiskEvent({
        event_type: "ORDER_APPROVED_SHADOW",
        severity: "INFO",
        signal_id: data.signalId,
        symbol: data.symbol,
        idempotency_key: data.idempotencyKey,
        reason: "Risk approved; live execution gate remains closed.",
        details: { intentId: intent.id, gateReasons: gate.reasons },
      });
      return { placed: false as const, reason: "Shadow approval recorded. Live execution gate is closed; no order was transmitted.", intentId: intent.id, correlationId };
    }

    const liveDecision = validateServerOrderIntent(intentInput, undefined, new Date(), { requireLiveReady: true });
    if (!liveDecision.allowed) {
      await updateOrderIntentByIdempotencyKey(data.idempotencyKey, { status: "REJECTED" });
      await recordRiskEvent({
        event_type: "ORDER_BLOCKED_LIVE",
        severity: "BLOCK",
        signal_id: data.signalId,
        symbol: data.symbol,
        idempotency_key: data.idempotencyKey,
        reason: liveDecision.reasons.join("; "),
        details: { intentId: intent.id },
      });
      return { placed: false as const, reason: "Live server gate blocked the order: " + liveDecision.reasons.join("; "), intentId: intent.id, correlationId };
    }

    await updateOrderIntentByIdempotencyKey(data.idempotencyKey, { status: "SUBMITTING" });
    const broker = await placeLiveDhanOrder({
      dhanClientId: process.env["DHAN_CLIENT_ID"] ?? "",
      correlationId,
      transactionType: data.side,
      exchangeSegment: data.exchangeSegment,
      productType: "INTRADAY",
      orderType: "MARKET",
      securityId: data.securityId,
      quantity: data.quantity,
      validity: "DAY",
    });

    const nextStatus = broker.state === "UNKNOWN" ? "UNKNOWN" : broker.state === "REJECTED" ? "REJECTED" : "SUBMITTED";
    await updateOrderIntentByIdempotencyKey(data.idempotencyKey, {
      status: nextStatus,
      broker_order_id: broker.orderId ?? null,
    });
    await recordRiskEvent({
      event_type: broker.placed ? "ORDER_SUBMITTED" : "ORDER_SUBMISSION_RESULT",
      severity: broker.state === "REJECTED" ? "BLOCK" : "INFO",
      signal_id: data.signalId,
      symbol: data.symbol,
      idempotency_key: data.idempotencyKey,
      reason: broker.reason ?? "Order submitted to Dhan.",
      details: { intentId: intent.id, correlationId, orderId: broker.orderId ?? null, state: broker.state, code: broker.code ?? null },
    });

    return {
      placed: broker.placed,
      state: broker.state,
      orderId: broker.orderId,
      correlationId,
      intentId: intent.id,
      reason: broker.reason,
    };
  });


export const reconcileDhanOrder = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: { correlationId: string }) => ({ correlationId: String(input?.correlationId ?? "").trim() }))
  .handler(async ({ data }) => {
    const { getLiveDhanOrderByCorrelationId } = await import("./dhan-live-execution.server");
    const { getOrderIntentStateByCorrelationId, upsertBrokerOrder, updateOrderIntentByCorrelationId } = await import("./supabase.server");
    const { transitionOrderStatus } = await import("./trading/order-state-machine");
    if (!data.correlationId) return { ok: false as const, reason: "Missing correlation ID." };
    const broker = await getLiveDhanOrderByCorrelationId(data.correlationId);
    if (!broker.ok) return { ok: false as const, reason: broker.error, code: broker.code };
    if (!broker.data.orderId) return { ok: true as const, found: false as const, correlationId: data.correlationId };
    const durable = await getOrderIntentStateByCorrelationId(data.correlationId);
    const mapped = broker.data.orderStatus === "PART_TRADED" || (broker.data.filledQty > 0 && broker.data.filledQty < broker.data.quantity)
      ? "PARTIALLY_FILLED"
      : broker.data.orderStatus === "TRADED" ? "FILLED"
      : broker.data.orderStatus === "REJECTED" ? "REJECTED"
      : broker.data.orderStatus === "CANCELLED" ? "CANCELLED"
      : broker.data.orderStatus === "EXPIRED" ? "EXPIRED"
      : "SUBMITTED";
    const next = transitionOrderStatus(durable?.status ?? "UNKNOWN", mapped);
    await upsertBrokerOrder({
      order_intent_id: durable?.id ?? null,
      broker_order_id: broker.data.orderId,
      correlation_id: data.correlationId,
      status: next,
      symbol: broker.data.tradingSymbol || null,
      quantity: broker.data.quantity,
      filled_quantity: broker.data.filledQty,
      average_price: broker.data.averageTradedPrice || null,
      raw_payload: broker.data.raw,
      last_seen_at: new Date().toISOString(),
    });
    await updateOrderIntentByCorrelationId(data.correlationId, { status: next, broker_order_id: broker.data.orderId });
    return { ok: true as const, found: true as const, state: next, orderId: broker.data.orderId, filledQty: broker.data.filledQty, quantity: broker.data.quantity };
  });

export const cancelDhanOrder = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: { correlationId: string }) => ({ correlationId: String(input?.correlationId ?? "").trim() }))
  .handler(async ({ data }) => {
    const { getOrderIntentStateByCorrelationId, updateOrderIntentByCorrelationId } = await import("./supabase.server");
    const { cancelLiveDhanOrder } = await import("./dhan-live-execution.server");
    const { transitionOrderStatus } = await import("./trading/order-state-machine");
    if (!data.correlationId) return { ok: false as const, reason: "Missing correlation ID." };
    const durable = await getOrderIntentStateByCorrelationId(data.correlationId);
    if (!durable?.broker_order_id) return { ok: false as const, reason: "No broker order is attached to this intent." };
    const result = await cancelLiveDhanOrder(String(durable.broker_order_id));
    if (!result.ok) return { ok: false as const, reason: result.error };
    const next = transitionOrderStatus(durable.status, "CANCELLED");
    await updateOrderIntentByCorrelationId(data.correlationId, { status: next });
    return { ok: true as const, state: next, orderId: durable.broker_order_id };
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
