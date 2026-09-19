const SUPABASE_URL = process.env["SUPABASE_URL"] ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

function requireConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server storage is not configured.");
  }
  return { url: SUPABASE_URL.replace(/\/$/, ""), key: SUPABASE_SERVICE_ROLE_KEY };
}

async function request(path: string, init: RequestInit = {}) {
  const { url, key } = requireConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase storage request failed (HTTP ${response.status}).`);
  return text ? JSON.parse(text) : null;
}

export interface DurableOrderIntent {
  id: string;
  idempotency_key: string;
  status: string;
}

export async function getOrderIntentByIdempotencyKey(idempotencyKey: string) {
  const safe = encodeURIComponent(idempotencyKey);
  const rows = await request(`order_intents?idempotency_key=eq.${safe}&select=id,idempotency_key,status,broker_correlation_id,broker_order_id`);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

export async function createOrderIntent(input: Record<string, unknown>): Promise<DurableOrderIntent> {
  const rows = await request("order_intents", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.id) throw new Error("Supabase did not return the durable order intent.");
  return row as DurableOrderIntent;
}

export async function recordRiskEvent(input: Record<string, unknown>) {
  await request("risk_events", { method: "POST", body: JSON.stringify(input) });
}

export async function ingestDhanPostback(payload: Record<string, unknown>, eventKey: string) {
  const rows = await request("broker_postbacks", {
    method: "POST",
    body: JSON.stringify({
      event_key: eventKey,
      broker_order_id: typeof payload.orderId === "string" ? payload.orderId : null,
      correlation_id: typeof payload.correlationId === "string" ? payload.correlationId : null,
      event_type: typeof payload.orderStatus === "string" ? payload.orderStatus : "UNKNOWN",
      payload,
    }),
  });
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

export async function upsertBrokerOrder(input: Record<string, unknown>) {
  return request("broker_orders?on_conflict=broker_order_id", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
}

export async function upsertBrokerTrade(input: Record<string, unknown>) {
  return request("broker_trades?on_conflict=broker_trade_id", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
}

export async function updateOrderIntentByCorrelationId(correlationId: string, patch: Record<string, unknown>) {
  const safe = encodeURIComponent(correlationId);
  return request(`order_intents?broker_correlation_id=eq.${safe}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}
