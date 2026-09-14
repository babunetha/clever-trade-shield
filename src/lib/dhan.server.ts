/**
 * Server-only Dhan broker interface stubs.
 *
 * v1 contract: NOTHING here places a live order. Credentials are read from
 * server env inside functions only and are never returned to the browser.
 */

export const LIVE_EXECUTION_ENABLED = false as const;

export interface DhanCredentialStatus {
  clientIdConfigured: boolean;
  accessTokenConfigured: boolean;
  liveExecutionEnabled: false;
  mode: "SIMULATION";
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

/** Reports only booleans — never the secret values themselves. */
export function readDhanCredentialStatus(): DhanCredentialStatus {
  return {
    clientIdConfigured: Boolean(process.env["DHAN_CLIENT_ID"]),
    accessTokenConfigured: Boolean(process.env["DHAN_ACCESS_TOKEN"]),
    liveExecutionEnabled: LIVE_EXECUTION_ENABLED,
    mode: "SIMULATION",
  };
}

/** Hard-stopped placeholder for a future, separately reviewed live path. */
export async function placeDhanOrder(_order: DhanOrderRequest): Promise<DhanOrderResult> {
  return {
    placed: false,
    reason: "Live execution is disabled by feature flag. No order was transmitted to Dhan.",
  };
}
