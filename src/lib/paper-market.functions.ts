import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";
import { getDhanQuote } from "./dhan.server";

export const getDhanPaperMarks = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { securityIds: string[] }) => ({
    securityIds: Array.isArray(input?.securityIds)
      ? input.securityIds.map(String).slice(0, 20)
      : [],
  }))
  .handler(async ({ data }) => {
    if (!data.securityIds.length)
      return { ok: true as const, quotes: {}, asOf: new Date().toISOString() };
    const result = await getDhanQuote({ securityIds: data.securityIds, exchangeSegment: "NSE_EQ" });
    if (!result.ok) return result;
    const now = Date.now();
    const quotes = Object.fromEntries(
      Object.entries(result.data).map(([securityId, quote]) => {
        const ageMs = quote.lastTradeAt ? now - Date.parse(quote.lastTradeAt) : Number.POSITIVE_INFINITY;
        const fresh =
          Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 20_000 && quote.lastPrice > 0;
        return [
          securityId,
          {
            ...quote,
            dataAgeSeconds: Number.isFinite(ageMs) && ageMs >= 0 ? Math.round(ageMs / 1000) : null,
            dataStatus: fresh ? "FRESH" : "STALE",
          },
        ];
      }),
    );
    return { ok: true as const, quotes, asOf: new Date(now).toISOString() };
  });
