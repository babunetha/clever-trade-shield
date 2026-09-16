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

export const LIVE_EXECUTION_ENABLED = false as const;

const DHAN_BASE = "https://api.dhan.co/v2";
const TIMEOUT_MS = 10_000;

export interface DhanCredentialStatus {
  clientIdConfigured: boolean;
  accessTokenConfigured: boolean;
  liveExecutionEnabled: false;
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
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
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

export interface DhanLtp {
  securityId: string;
  lastPrice: number;
}

/**
 * POST /v2/marketfeed/ltp — live last-traded prices for NSE cash securities.
 * Requires the Data API subscription on the Dhan account; without it Dhan
 * answers 401/403 and we surface that as UNAUTHORIZED.
 */
export async function getDhanLtp(securityIds: string[]): Promise<DhanResult<DhanLtp[]>> {
  if (!securityIds.length) return { ok: true, data: [] };
  const result = await dhanRequest<Record<string, unknown>>("/marketfeed/ltp", {
    method: "POST",
    body: { NSE_EQ: securityIds.map((id) => Number(id)).filter(Number.isFinite) },
  });
  if (!result.ok) return result;

  const data = (result.data["data"] ?? {}) as Record<string, Record<string, { last_price?: number }>>;
  const nse = data["NSE_EQ"] ?? {};
  return {
    ok: true,
    data: Object.entries(nse).map(([securityId, value]) => ({
      securityId,
      lastPrice: Number(value?.last_price ?? 0),
    })),
  };
}

/* ---------------------------- EXECUTION: BLOCKED --------------------------- */

/**
 * Hard-stopped placeholder for a future, separately reviewed live path.
 * Refuses before any network call — no Dhan order endpoint is ever contacted.
 */
export async function placeDhanOrder(_order: DhanOrderRequest): Promise<DhanOrderResult> {
  return {
    placed: false,
    reason: "Live execution is disabled by feature flag. No order was transmitted to Dhan.",
  };
}
