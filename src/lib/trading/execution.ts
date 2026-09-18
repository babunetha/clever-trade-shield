import type { Side } from "./types";

export type ExecutionMode = "PAPER" | "SEMI_AUTO" | "LIVE_AUTO";

export interface OrderRequest {
  symbol: string;
  side: Side;
  quantity: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  productType: "INTRADAY";
  signalId?: string;
}

export interface OrderResult {
  accepted: boolean;
  mode: ExecutionMode;
  orderId?: string;
  reason?: string;
}

export interface ExecutionAdapter {
  readonly name: string;
  readonly supportsLiveOrders: boolean;
  place(request: OrderRequest): Promise<OrderResult>;
  cancel(orderId: string): Promise<OrderResult>;
}

export class PaperExecutionAdapter implements ExecutionAdapter {
  readonly name = "paper";
  readonly supportsLiveOrders = false;

  async place(request: OrderRequest): Promise<OrderResult> {
    if (request.quantity <= 0) return { accepted: false, mode: "PAPER", reason: "Quantity must be positive." };
    return { accepted: true, mode: "PAPER", orderId: "PAPER-" + Date.now().toString(36) };
  }

  async cancel(orderId: string): Promise<OrderResult> {
    return { accepted: true, mode: "PAPER", orderId };
  }
}

export class DisabledLiveExecutionAdapter implements ExecutionAdapter {
  readonly name = "live-disabled";
  readonly supportsLiveOrders = false;

  async place(): Promise<OrderResult> {
    return { accepted: false, mode: "LIVE_AUTO", reason: "Live execution is disabled by the application safety gate." };
  }

  async cancel(orderId: string): Promise<OrderResult> {
    return { accepted: false, mode: "LIVE_AUTO", orderId, reason: "Live execution is disabled by the application safety gate." };
  }
}

export function executionAdapterFor(mode: ExecutionMode): ExecutionAdapter {
  return mode === "PAPER" ? new PaperExecutionAdapter() : new DisabledLiveExecutionAdapter();
}
