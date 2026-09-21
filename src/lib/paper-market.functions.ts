import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";
import { getDhanQuote } from "./dhan.server";

export const getDhanPaperMarks = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { securityIds: string[] }) => ({
    securityIds: Array.isArray(input?.securityIds) ? input.securityIds.map(String).slice(0, 20) : [],
  }))
  .handler(async ({ data }) => {
    if (!data.securityIds.length) return { ok: true as const, quotes: {}, asOf: new Date().toISOString() };
    const result = await getDhanQuote({ securityIds: data.securityIds, exchangeSegment: "NSE_EQ" });
    if (!result.ok) return result;
    return { ok: true as const, quotes: result.data, asOf: new Date().toISOString() };
  });
