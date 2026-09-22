/**
 * Server-only Dhan broker interface.
 *
 * Hard rules enforced in this file:
 *  - DHAN_CLIENT_ID / DHAN_ACCESS_TOKEN are read from process.env INSIDE
 *    functions only, are never returned to the caller, and are never logged.
 *  - Only authenticated READ-ONLY endpoints are wired.
 *  - Order placement/modification/cancellation is hard-disabled by a flag and
 *    refuses before any network call is made.
 */

export const LIVE_EXECUTION_ENABLED = process.env["CTS_LIVE_EXECUTION_ENABLED"] === "true" as const;

const DHAN_BASE = "https://api.dhan.co/v2";
const TIMEOUT_MS = 10_000;

export interface DhanCredentialStatus {
  clientIdConfigured: boolean;
  accessTokenConfigured: boolean;
  liveExecutionEnabled: boolean;
  /** SIMULATION until both credentials exist; then live data reads are possible. */
  mode: "SIMULATION" | "LIVE_READ_ONLY";
}

export interface DhanOrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  stopLoss: number;
  productType: "INTRADAY";
}

export interface DhanOrderResult {
  placed: false;
  reason: string;
}

/** Discriminated result so the UI never has to inspect thrown errors. */
export type DhanResult<T> = { ok: true; data: T } | { ok: false; error: string; code: DhanErrorCode };

export type DhanErrorCode =
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK"
  | "BAD_RESPONSE"
  | "UPSTREAM";

/** Reports only booleans — never the secret values themselves. */
export function readDhanCredentialStatus(): DhanCredentialStatus {
  const clientIdConfigured = Boolean(process.env["DHAN_CLIENT_ID"]);
  const accessTokenConfigured = Boolean(process.env["DHAN_ACCESS_TOKEN"]);
  return {
    clientIdConfigured,
    accessTokenConfigured,
    liveExecutionEnabled: LIVE_EXECUTION_ENABLED,
    mode: clientIdConfigured && accessTokenConfigured ? "LIVE_READ_ONLY" : "SIMULATION",
  };
}

function credentials(): { clientId: string; accessToken: string } | null {
  const clientId = process.env["DHAN_CLIENT_ID"];
  const accessToken = process.env["DHAN_ACCESS_TOKEN"];
  if (!clientId || !accessToken) return null;
  return { clientId, accessToken };
}

/**
 * Strips anything secret-shaped out of a message before it can reach a log,
 * a response body or the UI. Defensive: upstream errors sometimes echo headers.
 */
function scrub(message: string): string {
  const creds = credentials();
  let out = message;
  if (creds) {
    out = out.split(creds.accessToken).join("[redacted]");
    out = out.split(creds.clientId).join("[redacted]");
  }
  // Long JWT-ish blobs, just in case.
  return out.replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, "[redacted]").slice(0, 300);
}

async function dhanRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<DhanResult<T>> {
  const creds = credentials();
  if (!creds) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      error: "Dhan credentials are not configured on the server. Add DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN as backend secrets.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${DHAN_BASE}${path}`, {
      method: init.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "access-token": creds.accessToken,
        "client-id": creds.clientId,
      },
      body: init.body === undefined ? null : JSON.stringify(init.body),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          code: "UNAUTHORIZED",
          error: "Dhan rejected the credentials (401/403). The access token is likely expired or lacks data-API permission.",
        };
      }
      if (response.status === 429) {
        return { ok: false, code: "RATE_LIMITED", error: "Dhan rate limit reached. Wait a moment and test again." };
      }
      return {
        ok: false,
        code: "UPSTREAM",
        error: scrub(`Dhan returned HTTP ${response.status}: ${text || "no response body"}`),
      };
    }

    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, code: "BAD_RESPONSE", error: "Dhan returned a response that was not valid JSON." };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, code: "TIMEOUT", error: `Dhan did not respond within ${TIMEOUT_MS / 1000}s.` };
    }
    return {
      ok: false,
      code: "NETWORK",
      error: scrub(`Could not reach Dhan: ${error instanceof Error ? error.message : "unknown network error"}`),
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ READ-ONLY API ----------------------------- */

export interface DhanProfileSummary {
  /** Present only because Dhan echoes it; masked before it leaves the server. */
  dhanClientIdMasked: string;
  tokenValidity: string | null;
  activeSegments: string | null;
}

/** GET /v2/profile — the canonical connection test. */
export async function testDhanConnection(): Promise<DhanResult<DhanProfileSummary>> {
  const result = await dhanRequest<Record<string, unknown>>("/profile");
  if (!result.ok) return result;
  const raw = result.data;
  const id = typeof raw["dhanClientId"] === "string" ? raw["dhanClientId"] : "";
  return {
    ok: true,
    data: {
      dhanClientIdMasked: id ? `${"•".repeat(Math.max(0, id.length - 4))}${id.slice(-4)}` : "unavailable",
      tokenValidity: typeof raw["tokenValidity"] === "string" ? raw["tokenValidity"] : null,
      activeSegments: typeof raw["activeSegment"] === "string" ? raw["activeSegment"] : null,
    },
  };
}

export interface DhanFunds {
  availableBalance: number | null;
  withdrawableBalance: number | null;
  utilisedAmount: number | null;
  collateralAmount: number | null;
}

/** GET /v2/fundlimit */
export async function getDhanFunds(): Promise<DhanResult<DhanFunds>> {
  const result = await dhanRequest<Record<string, unknown>>("/fundlimit");
  if (!result.ok) return result;
  const n = (k: string) => (typeof result.data[k] === "number" ? (result.data[k] as number) : null);
  return {
    ok: true,
    data: {
      availableBalance: n("availabelBalance") ?? n("availableBalance"),
      withdrawableBalance: n("withdrawableBalance"),
      utilisedAmount: n("utilizedAmount") ?? n("utilisedAmount"),
      collateralAmount: n("collateralAmount"),
    },
  };
}

export interface DhanHolding {
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
}

/** GET /v2/holdings */
export async function getDhanHoldings(): Promise<DhanResult<DhanHolding[]>> {
  const result = await dhanRequest<unknown>("/holdings");
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
  return {
    ok: true,
    data: rows.map((r) => ({
      symbol: String(r["tradingSymbol"] ?? r["securityId"] ?? "—"),
      exchange: String(r["exchange"] ?? "NSE"),
      quantity: Number(r["totalQty"] ?? r["availableQty"] ?? 0),
      averagePrice: Number(r["avgCostPrice"] ?? 0),
    })),
  };
}

export interface DhanPosition {
  symbol: string;
  productType: string;
  netQuantity: number;
  buyAverage: number;
  sellAverage: number;
  realisedProfit: number;
  unrealisedProfit: number;
}

/** GET /v2/positions */
export async function getDhanPositions(): Promise<DhanResult<DhanPosition[]>> {
  const result = await dhanRequest<unknown>("/positions");
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
  return {
    ok: true,
    data: rows.map((r) => ({
      symbol: String(r["tradingSymbol"] ?? r["securityId"] ?? "—"),
      productType: String(r["productType"] ?? "—"),
      netQuantity: Number(r["netQty"] ?? 0),
      buyAverage: Number(r["buyAvg"] ?? 0),
      sellAverage: Number(r["sellAvg"] ?? 0),
      realisedProfit: Number(r["realizedProfit"] ?? 0),
      unrealisedProfit: Number(r["unrealizedProfit"] ?? 0),
    })),
  };
}

export interface DhanCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DhanHistoricalRequest {
  securityId: string;
  exchangeSegment: "NSE_EQ" | "BSE_EQ";
  instrument: "EQUITY";
  fromDate: string;
  toDate: string;
  interval?: "1" | "5" | "15" | "25" | "60";
}

/**
 * Fetches Dhan v2 intraday historical candles. Dhan documents 1/5/15/25/60
 * minute intervals and recommends storing the returned data locally.
 */
export async function getDhanHistoricalCandles(
  request: DhanHistoricalRequest,
): Promise<DhanResult<DhanCandle[]>> {
  const interval = request.interval ?? "5";
  const result = await dhanRequest<Record<string, unknown>>("/charts/intraday", {
    method: "POST",
    body: {
      securityId: request.securityId,
      exchangeSegment: request.exchangeSegment,
      instrument: request.instrument,
      interval,
      oi: false,
      fromDate: request.fromDate,
      toDate: request.toDate,
    },
  });
  if (!result.ok) return result;

  const raw = result.data;
  const open = Array.isArray(raw["open"]) ? raw["open"] as unknown[] : [];
  const high = Array.isArray(raw["high"]) ? raw["high"] as unknown[] : [];
  const low = Array.isArray(raw["low"]) ? raw["low"] as unknown[] : [];
  const close = Array.isArray(raw["close"]) ? raw["close"] as unknown[] : [];
  const volume = Array.isArray(raw["volume"]) ? raw["volume"] as unknown[] : [];
  const timestamps = Array.isArray(raw["timestamp"]) ? raw["timestamp"] as unknown[] : [];
  const length = Math.min(open.length, high.length, low.length, close.length, volume.length, timestamps.length);

  return {
    ok: true,
    data: Array.from({ length }, (_, i) => ({
      timestamp: Number(timestamps[i]),
      open: Number(open[i]),
      high: Number(high[i]),
      low: Number(low[i]),
      close: Number(close[i]),
      volume: Number(volume[i]),
    })).filter((c) => Number.isFinite(c.timestamp) && Number.isFinite(c.close)),
  };
}

export interface DhanDailyHistoricalRequest {
  securityId: string;
  exchangeSegment: "NSE_EQ" | "BSE_EQ";
  instrument: "EQUITY";
  fromDate: string;
  toDate: string;
}

export async function getDhanDailyHistoricalCandles(
  request: DhanDailyHistoricalRequest,
): Promise<DhanResult<DhanCandle[]>> {
  const result = await dhanRequest<Record<string, unknown>>("/charts/historical", {
    method: "POST",
    body: {
      securityId: request.securityId,
      exchangeSegment: request.exchangeSegment,
      instrument: request.instrument,
      expiryCode: 0,
      oi: false,
      fromDate: request.fromDate,
      toDate: request.toDate,
    },
  });
  if (!result.ok) return result;
  const raw = result.data;
  const open = Array.isArray(raw["open"]) ? raw["open"] as unknown[] : [];
  const high = Array.isArray(raw["high"]) ? raw["high"] as unknown[] : [];
  const low = Array.isArray(raw["low"]) ? raw["low"] as unknown[] : [];
  const close = Array.isArray(raw["close"]) ? raw["close"] as unknown[] : [];
  const volume = Array.isArray(raw["volume"]) ? raw["volume"] as unknown[] : [];
  const timestamps = Array.isArray(raw["timestamp"]) ? raw["timestamp"] as unknown[] : [];
  const length = Math.min(open.length, high.length, low.length, close.length, volume.length, timestamps.length);
  return {
    ok: true,
    data: Array.from({ length }, (_, i) => ({
      timestamp: Number(timestamps[i]),
      open: Number(open[i]),
      high: Number(high[i]),
      low: Number(low[i]),
      close: Number(close[i]),
      volume: Number(volume[i]),
    })).filter((x) => Number.isFinite(x.timestamp) && Number.isFinite(x.close)),
  };
}

export interface DhanQuote {
  securityId: string;
  lastPrice: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  averagePrice: number;
  netChange: number;
}

export async function getDhanQuote(request: DhanLtpRequest): Promise<DhanResult<Record<string, DhanQuote>>> {
  const ids = request.securityIds
    .map((id) => String(id).trim())
    .filter((id) => /^\\d{1,8}$/.test(id))
    .slice(0, 1000);
  if (!ids.length) return { ok: true, data: {} };
  const segmentName = request.exchangeSegment ?? "NSE_EQ";
  const result = await dhanRequest<Record<string, unknown>>("/marketfeed/quote", {
    method: "POST",
    body: { [segmentName]: ids.map(Number) },
  });
  if (!result.ok) return result;
  const segment = (result.data["data"] as Record<string, unknown> | undefined)?.[segmentName];
  const map: Record<string, DhanQuote> = {};
  if (segment && typeof segment === "object") {
    for (const [id, value] of Object.entries(segment as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      const o = (v["ohlc"] ?? {}) as Record<string, unknown>;
      const lastPrice = Number(v["last_price"]);
      if (!Number.isFinite(lastPrice)) continue;
      map[id] = {
        securityId: id,
        lastPrice,
        open: Number(o["open"] ?? 0),
        close: Number(o["close"] ?? 0),
        high: Number(o["high"] ?? 0),
        low: Number(o["low"] ?? 0),
        volume: Number(v["volume"] ?? 0),
        averagePrice: Number(v["average_price"] ?? 0),
        netChange: Number(v["net_change"] ?? 0),
      };
    }
  }
  return { ok: true, data: map };
}

export interface DhanLtpRequest {
  securityIds: string[];
  exchangeSegment?: "NSE_EQ" | "BSE_EQ" | "IDX_I";
}

export async function getDhanLtp(request: DhanLtpRequest): Promise<DhanResult<Record<string, number>>> {
  const ids = request.securityIds
    .map((id) => String(id).trim())
    .filter((id) => /^\\d{1,8}$/.test(id))
    .slice(0, 1000);
  const segmentName = request.exchangeSegment ?? "NSE_EQ";
  const result = await dhanRequest<Record<string, unknown>>("/marketfeed/ltp", {
    method: "POST",
    body: { [segmentName]: ids.map(Number) },
  });
  if (!result.ok) return result;
  const segment = (result.data["data"] as Record<string, unknown> | undefined)?.[segmentName];
  const map: Record<string, number> = {};
  if (segment && typeof segment === "object") {
    for (const [id, value] of Object.entries(segment as Record<string, unknown>)) {
      if (value && typeof value === "object" && "last_price" in value) {
        const price = Number((value as { last_price?: unknown }).last_price);
        if (Number.isFinite(price)) map[id] = price;
      }
    }
  }
  return { ok: true, data: map };
}


export interface DhanOrderSummary {
  orderId: string;
  correlationId: string;
  orderStatus: string;
  transactionType: string;
  exchangeSegment: string;
  productType: string;
  tradingSymbol: string;
  securityId: string;
  quantity: number;
  filledQuantity: number;
  averageTradedPrice: number;
  updateTime: string;
}

export async function getDhanOrders(): Promise<DhanResult<DhanOrderSummary[]>> {
  const result = await dhanRequest<unknown>("/orders");
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
  return {
    ok: true,
    data: rows.map((row) => ({
      orderId: String(row["orderId"] ?? ""),
      correlationId: String(row["correlationId"] ?? ""),
      orderStatus: String(row["orderStatus"] ?? ""),
      transactionType: String(row["transactionType"] ?? ""),
      exchangeSegment: String(row["exchangeSegment"] ?? ""),
      productType: String(row["productType"] ?? ""),
      tradingSymbol: String(row["tradingSymbol"] ?? ""),
      securityId: String(row["securityId"] ?? ""),
      quantity: Number(row["quantity"] ?? 0),
      filledQuantity: Number(row["filledQty"] ?? 0),
      averageTradedPrice: Number(row["averageTradedPrice"] ?? 0),
      updateTime: String(row["updateTime"] ?? ""),
    })),
  };
}

export async function getDhanOrderByCorrelationId(correlationId: string): Promise<DhanResult<DhanOrderSummary | null>> {
  if (!/^[A-Za-z0-9 _-]{1,30}$/.test(correlationId)) {
    return { ok: false, code: "BAD_RESPONSE", error: "Invalid correlation ID." };
  }
  const result = await dhanRequest<Record<string, unknown>>("/orders/external/" + encodeURIComponent(correlationId));
  if (!result.ok) return result;
  if (!result.data || !Object.keys(result.data).length) return { ok: true, data: null };
  const row = result.data;
  return {
    ok: true,
    data: {
      orderId: String(row["orderId"] ?? ""),
      correlationId: String(row["correlationId"] ?? correlationId),
      orderStatus: String(row["orderStatus"] ?? ""),
      transactionType: String(row["transactionType"] ?? ""),
      exchangeSegment: String(row["exchangeSegment"] ?? ""),
      productType: String(row["productType"] ?? ""),
      tradingSymbol: String(row["tradingSymbol"] ?? ""),
      securityId: String(row["securityId"] ?? ""),
      quantity: Number(row["quantity"] ?? 0),
      filledQuantity: Number(row["filledQty"] ?? 0),
      averageTradedPrice: Number(row["averageTradedPrice"] ?? 0),
      updateTime: String(row["updateTime"] ?? ""),
    },
  };
}

export interface DhanTradeSummary {
  orderId: string;
  exchangeTradeId: string;
  transactionType: string;
  tradingSymbol: string;
  securityId: string;
  tradedQuantity: number;
  tradedPrice: number;
  updateTime: string;
}

export async function getDhanTrades(): Promise<DhanResult<DhanTradeSummary[]>> {
  const result = await dhanRequest<unknown>("/trades");
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
  return {
    ok: true,
    data: rows.map((row) => ({
      orderId: String(row["orderId"] ?? ""),
      exchangeTradeId: String(row["exchangeTradeId"] ?? ""),
      transactionType: String(row["transactionType"] ?? ""),
      tradingSymbol: String(row["tradingSymbol"] ?? ""),
      securityId: String(row["securityId"] ?? ""),
      tradedQuantity: Number(row["tradedQuantity"] ?? 0),
      tradedPrice: Number(row["tradedPrice"] ?? 0),
      updateTime: String(row["updateTime"] ?? ""),
    })),
  };
}

export { liveExecutionGate, placeLiveDhanOrder, getLiveDhanOrderByCorrelationId, cancelLiveDhanOrder } from "./dhan-live-execution.server";

export async function placeDhanOrder(_order: DhanOrderRequest): Promise<DhanOrderResult> {
  return { placed: false, reason: "Use the durable approved-trade workflow for execution; direct broker placement is not exposed." };
}

export function scrubDhanMessage(message: string) {
  return scrub(message);
}
