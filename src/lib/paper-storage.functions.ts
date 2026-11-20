import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";
import { quoteHealth } from "./scanner/quote-health";
import {
  appendTradeAudit,
  approvePaperTradeAtomically,
  getPaperTradeById,
  listPaperRecords,
  updatePaperTradeRecord,
} from "./supabase.server";
import type { Trade } from "./trading/types";

type PaperDataSource = "DHAN_LIVE" | "SIMULATED";

export const approvePaperTrade = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    (input: {
      approvalId: string;
      symbol: string;
      securityId?: string;
      name: string;
      side: "LONG" | "SHORT";
      entry: number;
      stopLoss: number;
      target1: number;
      quantity: number;
      source: string;
      dataSource: PaperDataSource;
    }) => ({
      approvalId: String(input.approvalId ?? "")
        .trim()
        .slice(0, 120),
      symbol: String(input.symbol ?? "")
        .trim()
        .toUpperCase()
        .slice(0, 30),
      securityId: String(input.securityId ?? "").trim(),
      name: String(input.name ?? "")
        .trim()
        .slice(0, 100),
      side: input.side,
      entry: Number(input.entry),
      stopLoss: Number(input.stopLoss),
      target1: Number(input.target1),
      quantity: Number(input.quantity),
      source: String(input.source ?? "manual").slice(0, 80),
      dataSource: input.dataSource,
    }),
  )
  .handler(async ({ data }) => {
    if (process.env["CTS_PAPER_APPROVALS_ENABLED"] === "false")
      return {
        ok: false as const,
        reason: "Paper approvals are disabled by the server safety switch.",
      };
    if (!data.approvalId || !data.symbol || !data.name)
      return { ok: false as const, reason: "Missing approval, symbol or company identity." };
    if (![data.entry, data.stopLoss, data.target1, data.quantity].every(Number.isFinite))
      return { ok: false as const, reason: "Trade values must be finite numbers." };
    if (!Number.isInteger(data.quantity) || data.quantity <= 0)
      return { ok: false as const, reason: "Quantity must be a positive whole number." };

    let entry = data.entry;
    let sourceTimestamp: string | null = null;
    if (data.dataSource === "DHAN_LIVE") {
      if (!/^\d{1,8}$/.test(data.securityId))
        return {
          ok: false as const,
          reason: "A valid Dhan security ID is required for live-source approval.",
        };
      const { resolveDhanInstruments } = await import("./market/instruments");
      const resolved = await resolveDhanInstruments([data.symbol]);
      const instrument = resolved.find(
        (item) =>
          item.exchangeSegment === "NSE_EQ" && item.tradingSymbol.toUpperCase() === data.symbol,
      );
      if (!instrument || instrument.securityId !== data.securityId)
        return {
          ok: false as const,
          reason: "Symbol and Dhan security ID do not match the NSE instrument master.",
        };

      const { getDhanQuote } = await import("./dhan.server");
      const quoteResult = await getDhanQuote({
        securityIds: [instrument.securityId],
        exchangeSegment: "NSE_EQ",
      });
      if (!quoteResult.ok)
        return {
          ok: false as const,
          reason: "Could not re-verify the Dhan quote: " + quoteResult.error,
        };
      const quote = quoteResult.data[instrument.securityId];
      if (!quote)
        return { ok: false as const, reason: "Dhan did not return a quote for this security ID." };
      const health = quoteHealth(quote.lastPrice, quote.sourceTimestamp ?? "");
      if (!health.fresh)
        return {
          ok: false as const,
          reason: "Server-side Dhan quote check failed: " + health.reason,
        };
      if (Math.abs(data.entry - quote.lastPrice) / quote.lastPrice > 0.01)
        return {
          ok: false as const,
          reason:
            "The scanner entry differs from the current Dhan price by more than 1%. Re-run verification.",
        };
      entry = quote.lastPrice;
      sourceTimestamp = quote.sourceTimestamp;
    } else if (data.dataSource !== "SIMULATED") {
      return { ok: false as const, reason: "Unknown paper-trade data source." };
    }

    const stopValid = data.side === "LONG" ? data.stopLoss < entry : data.stopLoss > entry;
    const targetValid = data.side === "LONG" ? data.target1 > entry : data.target1 < entry;
    if (!stopValid || !targetValid)
      return {
        ok: false as const,
        reason: "Stop-loss and target are on the wrong side of the entry.",
      };

    const perShareRisk = Math.abs(entry - data.stopLoss);
    const riskRupees = Number((perShareRisk * data.quantity).toFixed(2));
    const rewardPerShare = Math.abs(data.target1 - entry);
    const riskReward = rewardPerShare / perShareRisk;
    if (!Number.isFinite(riskRupees) || riskRupees <= 0 || riskRupees > 500)
      return { ok: false as const, reason: "Server-calculated per-trade risk exceeds ₹500." };
    if (!Number.isFinite(riskReward) || riskReward < 1.5)
      return { ok: false as const, reason: "Server-calculated reward/risk is below 1.5R." };
    if (entry * data.quantity > 100000)
      return {
        ok: false as const,
        reason: "Position value exceeds the ₹100,000 paper capital cap.",
      };

    const openedAt = new Date().toISOString();
    const trade: Trade & {
      riskRupees: number;
      riskReward: number;
      dataSource: PaperDataSource;
      sourceTimestamp: string | null;
    } = {
      id: "TRD-" + randomUUID(),
      signalId: data.approvalId,
      securityId: data.securityId || undefined,
      symbol: data.symbol,
      name: data.name,
      side: data.side,
      entry: Number(entry.toFixed(2)),
      stopLoss: Number(data.stopLoss.toFixed(2)),
      target1: Number(data.target1.toFixed(2)),
      quantity: data.quantity,
      status: "OPEN",
      openedAt,
      notes: `Candidate (${data.source}) — server-approved paper simulation only`,
      simulated: true,
      riskRupees,
      riskReward: Number(riskReward.toFixed(4)),
      dataSource: data.dataSource,
      sourceTimestamp,
    };

    const result = (await approvePaperTradeAtomically({
      approvalId: data.approvalId,
      source: data.dataSource,
      sourceTimestamp,
      payload: trade as unknown as Record<string, unknown>,
    })) as { ok?: boolean; reason?: string; trade?: Trade };
    if (!result?.ok || !result.trade)
      return {
        ok: false as const,
        reason: result?.reason ?? "Server paper approval was not confirmed.",
      };
    return { ok: true as const, trade: result.trade };
  });

/**
 * Existing paper records may only be updated, never created, through this
 * endpoint. OPEN records can only change notes; closing is recalculated here.
 */
export const persistPaperTrade = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    (input: {
      id: string;
      symbol: string;
      status: "OPEN" | "CLOSED";
      openedAt: string;
      closedAt?: string;
      payload: Record<string, unknown>;
    }) => ({
      id: String(input.id ?? "").trim(),
      symbol: String(input.symbol ?? "")
        .trim()
        .toUpperCase(),
      status: input.status,
      openedAt: String(input.openedAt ?? ""),
      closedAt: input.closedAt ? String(input.closedAt) : null,
      payload: input.payload ?? {},
    }),
  )
  .handler(async ({ data }) => {
    const existing = await getPaperTradeById(data.id);
    if (!existing)
      throw new Error("Paper trades must be created through the server approval endpoint.");
    const previous = existing.payload as Record<string, unknown>;
    const immutable = [
      "id",
      "signalId",
      "securityId",
      "symbol",
      "name",
      "side",
      "entry",
      "stopLoss",
      "target1",
      "quantity",
      "openedAt",
      "simulated",
    ];
    for (const key of immutable) {
      if (JSON.stringify(previous[key] ?? null) !== JSON.stringify(data.payload[key] ?? null))
        throw new Error("Paper trade identity or risk fields cannot be changed after approval.");
    }
    if (existing.status === "CLOSED") {
      if (data.status !== "CLOSED") throw new Error("A closed paper trade cannot be reopened.");
      const payload = {
        ...previous,
        notes: String(data.payload.notes ?? previous.notes ?? "").slice(0, 1000),
      };
      await updatePaperTradeRecord({
        id: data.id,
        symbol: existing.symbol,
        status: "CLOSED",
        opened_at: existing.opened_at,
        closed_at: existing.closed_at,
        payload,
      });
      return { ok: true as const };
    }

    if (data.status === "OPEN") {
      const payload = {
        ...previous,
        notes: String(data.payload.notes ?? previous.notes ?? "").slice(0, 1000),
      };
      await updatePaperTradeRecord({
        id: data.id,
        symbol: existing.symbol,
        status: "OPEN",
        opened_at: existing.opened_at,
        payload,
      });
      return { ok: true as const };
    }

    const exit = Number(data.payload.exit);
    if (!Number.isFinite(exit) || exit <= 0)
      throw new Error("A valid simulated exit price is required.");
    const side = previous.side === "SHORT" ? "SHORT" : "LONG";
    const entry = Number(previous.entry);
    const quantity = Number(previous.quantity);
    const perShareRisk = Math.abs(entry - Number(previous.stopLoss));
    const pnl = Number(((exit - entry) * (side === "LONG" ? 1 : -1) * quantity).toFixed(2));
    const closedAt = new Date().toISOString();
    const requestedExitReason = String(data.payload.exitReason ?? "MANUAL");
    const exitReason: "STOP" | "TARGET" | "MANUAL" =
      requestedExitReason === "STOP" || requestedExitReason === "TARGET"
        ? requestedExitReason
        : "MANUAL";
    const payload = {
      ...previous,
      exit,
      pnl,
      rMultiple: perShareRisk ? Number((pnl / (perShareRisk * quantity)).toFixed(2)) : 0,
      outcome: pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN",
      exitReason,
      status: "CLOSED",
      closedAt,
      notes: String(data.payload.notes ?? previous.notes ?? "").slice(0, 1000),
    };
    await updatePaperTradeRecord({
      id: data.id,
      symbol: existing.symbol,
      status: "CLOSED",
      opened_at: existing.opened_at,
      closed_at: closedAt,
      payload,
    });
    return { ok: true as const, trade: payload };
  });

export const persistTradeAudit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    (input: {
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
    }),
  )
  .handler(async ({ data }) => {
    await appendTradeAudit(data);
    return { ok: true as const };
  });

export const loadPaperRecords = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const records = await listPaperRecords();
    return {
      tradesJson: JSON.stringify(records.trades),
      audit: records.audit as {
        id: string;
        at: string;
        action: string;
        severity: "INFO" | "WARN" | "CRITICAL";
        detail: string;
      }[],
    };
  });

