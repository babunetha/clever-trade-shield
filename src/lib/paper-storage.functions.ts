import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";
import { appendTradeAudit, upsertPaperTrade } from "./supabase.server";

export const persistPaperTrade = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: {
    id: string;
    symbol: string;
    status: "OPEN" | "CLOSED";
    openedAt: string;
    closedAt?: string;
    payload: Record<string, unknown>;
  }) => ({
    id: String(input.id),
    symbol: String(input.symbol).toUpperCase(),
    status: input.status,
    openedAt: String(input.openedAt),
    closedAt: input.closedAt ? String(input.closedAt) : null,
    payload: input.payload ?? {},
  }))
  .handler(async ({ data }) => {
    await upsertPaperTrade({
      id: data.id,
      symbol: data.symbol,
      status: data.status,
      opened_at: data.openedAt,
      closed_at: data.closedAt,
      payload: data.payload,
    });
    return { ok: true as const };
  });

export const persistTradeAudit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: {
    id: string;
    at: string;
    action: string;
    severity: "INFO" | "WARN" | "CRITICAL";
    detail: string;
    payload?: Record<string, unknown>;
  }) => ({
    id: String(input.id),
    at: String(input.at),
    action: String(input.action),
    severity: input.severity,
    detail: String(input.detail).slice(0, 2000),
    payload: input.payload ?? {},
  }))
  .handler(async ({ data }) => {
    await appendTradeAudit(data);
    return { ok: true as const };
  });
