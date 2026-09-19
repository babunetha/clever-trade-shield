import { createHash, timingSafeEqual } from "node:crypto";
import { transitionOrderStatus, type OrderStatus } from "./trading/order-state-machine";
import {
  ingestDhanPostback,
  getOrderIntentByCorrelationId,
  updateOrderIntentByCorrelationId,
  upsertBrokerOrder,
  upsertBrokerTrade,
  getOrderIntentStateByCorrelationId,
} from "./supabase.server";

const allowedStatuses = new Set(["TRANSIT", "PENDING", "REJECTED", "CANCELLED", "TRADED", "EXPIRED"]);

function equalSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPostbackRequest(url: string, body: string) {
  const expected = process.env["DHAN_POSTBACK_SECRET"];
  if (!expected) return false;
  const token = new URL(url).searchParams.get("token") ?? "";
  return equalSecret(token, expected);
}

export async function processDhanPostback(url: string, body: string) {
  if (!verifyPostbackRequest(url, body)) throw new Error("Unauthorized Dhan postback.");
  const payload = JSON.parse(body) as Record<string, unknown>;
  const status = String(payload.orderStatus ?? "");
  const orderId = String(payload.orderId ?? "");
  const correlationId = String(payload.correlationId ?? "");
  const dhanClientId = String(payload.dhanClientId ?? "");

  if (!orderId || !correlationId || !allowedStatuses.has(status)) throw new Error("Invalid Dhan postback payload.");
  const configuredClient = process.env["DHAN_CLIENT_ID"] ?? "";
  if (!configuredClient || dhanClientId !== configuredClient) throw new Error("Dhan postback client mismatch.");

  const eventKey = createHash("sha256").update(body).digest("hex");
  const intent = await getOrderIntentByCorrelationId(correlationId);
  const durableState = await getOrderIntentStateByCorrelationId(correlationId);
  await ingestDhanPostback(payload, eventKey);

  const filledQty = Number(payload.filled_qty ?? 0);
  const quantity = Number(payload.quantity ?? 0);
  const mappedStatus =
    status === "TRADED" && filledQty > 0 && filledQty < quantity ? "PARTIALLY_FILLED" :
    status === "TRADED" ? "FILLED" :
    status === "REJECTED" ? "REJECTED" :
    status === "CANCELLED" ? "CANCELLED" :
    status === "EXPIRED" ? "EXPIRED" : "SUBMITTED";

  await upsertBrokerOrder({
    order_intent_id: intent?.id ?? null,
    broker_order_id: orderId,
    correlation_id: correlationId,
    status: mappedStatus,
    transaction_type: payload.transactionType ?? null,
    symbol: payload.tradingSymbol ?? null,
    quantity: Number.isFinite(quantity) ? quantity : null,
    filled_quantity: Number.isFinite(filledQty) ? filledQty : 0,
    average_price: Number(payload.averageTradedPrice ?? payload.price ?? 0) || null,
    raw_payload: payload,
    last_seen_at: new Date().toISOString(),
  });
  const safeNext = transitionOrderStatus(durableState?.status ?? "SUBMITTED", mappedStatus as OrderStatus);
  await updateOrderIntentByCorrelationId(correlationId, {
    status: safeNext,
    broker_order_id: orderId,
  });

  return { accepted: true, eventKey, status: mappedStatus };
}
