import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";
import { resolveDhanInstruments } from "./market/instruments";

const DEFAULT_WATCHLIST = [
  "RELIANCE", "HDFCBANK", "INFY", "TATAMOTORS", "SBIN", "ICICIBANK",
  "ITC", "AXISBANK", "TATASTEEL", "LT", "MARUTI", "BHARTIARTL",
];

export const getDhanMarketSnapshot = createServerFn({ method: "POST" }).middleware([authMiddleware])
  .inputValidator((input: { symbols?: string[] }) => ({
    symbols: (input?.symbols?.length ? input.symbols : DEFAULT_WATCHLIST)
      .map((s) => String(s).trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 100),
  }))
  .handler(async ({ data }) => {
    const { getDhanQuote } = await import("./dhan.server");
    const instruments = await resolveDhanInstruments(data.symbols);
    const grouped = new Map<string, string[]>();
    for (const instrument of instruments) {
      const ids = grouped.get(instrument.exchangeSegment) ?? [];
      ids.push(instrument.securityId);
      grouped.set(instrument.exchangeSegment, ids);
    }

    const snapshots: Record<string, {
      symbol: string;
      name: string;
      securityId: string;
      exchangeSegment: string;
      ltp: number;
      prevClose: number;
      change: number;
      changePct: number;
      dayHigh: number;
      dayLow: number;
      volume: number;
      averagePrice: number;
    }> = {};

    for (const [segment, securityIds] of grouped) {
      const result = await getDhanQuote({ securityIds, exchangeSegment: segment as "NSE_EQ" | "BSE_EQ" });
      if (!result.ok) return result;
      for (const instrument of instruments.filter((x) => x.exchangeSegment === segment)) {
        const q = result.data[instrument.securityId];
        if (!q) continue;
        const prevClose = q.close;
        const change = q.netChange || (prevClose ? q.lastPrice - prevClose : 0);
        snapshots[instrument.tradingSymbol] = {
          symbol: instrument.tradingSymbol,
          name: instrument.customSymbol || instrument.tradingSymbol,
          securityId: instrument.securityId,
          exchangeSegment: instrument.exchangeSegment,
          ltp: q.lastPrice,
          prevClose,
          change,
          changePct: prevClose ? (change / prevClose) * 100 : 0,
          dayHigh: q.high,
          dayLow: q.low,
          volume: q.volume,
          averagePrice: q.averagePrice,
        };
      }
    }

    return { ok: true as const, data: { asOf: new Date().toISOString(), quotes: snapshots } };
  });
