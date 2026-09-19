import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";
import { dhanMarketDataEngine } from "./market-data-engine";

const DEFAULT_WATCHLIST = [
  "RELIANCE", "HDFCBANK", "INFY", "TATAMOTORS", "SBIN", "ICICIBANK",
  "ITC", "AXISBANK", "TATASTEEL", "LT", "MARUTI", "BHARTIARTL",
];

export const getDhanMarketSnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { symbols?: string[] }) => ({
    symbols: (input?.symbols?.length ? input.symbols : DEFAULT_WATCHLIST)
      .map((s) => String(s).trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 100),
  }))
  .handler(async ({ data }) => {
    return dhanMarketDataEngine.snapshot(data.symbols);
  });
