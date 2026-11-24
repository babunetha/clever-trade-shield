import { useState, useEffect, useMemo } from "react";
import type { Bias } from "../trading/types";
import { getDhanMarketSnapshot } from "@/lib/market.functions";
import { useQuery } from "@tanstack/react-query";
import { quoteHealth } from "@/lib/scanner/quote-health";
const WATCHLIST = [
  "RELIANCE",
  "HDFCBANK",
  "INFY",
  "TATAMOTORS",
  "SBIN",
  "ICICIBANK",
  "ITC",
  "AXISBANK",
  "TATASTEEL",
  "LT",
  "MARUTI",
  "BHARTIARTL",
  "NIFTY",
  "BANKNIFTY",
];

export function useDhanOverview(symbols = WATCHLIST) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const feed = useQuery({
    queryKey: ["dhan-market-overview", symbols],
    enabled: symbols.length > 0,
    queryFn: async () => {
      const result = await getDhanMarketSnapshot({ data: { symbols } });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    refetchInterval: 5000,
    retry: false,
  });
  const data = feed.isError ? undefined : feed.data;
  const { quotes, indices, unavailable } = useMemo(() => {
    const rows = Object.values(data?.quotes ?? {});
    const health = (row: (typeof rows)[number]) =>
      quoteHealth(row.ltp, row.sourceTimestamp ?? "", now);
    const fresh = rows.filter((row) => health(row).fresh);
    return {
      quotes: fresh.filter((row) => row.exchangeSegment === "NSE_EQ"),
      indices: fresh
        .filter((row) => row.exchangeSegment === "IDX_I")
        .map((row) => ({
          ...row,
          bias: (row.changePct > 0.25
            ? "BULLISH"
            : row.changePct < -0.25
              ? "BEARISH"
              : "NEUTRAL") as Bias,
        })),
      unavailable: symbols
        .filter((symbol) => !fresh.some((row) => row.symbol === symbol))
        .map((symbol) => {
          const row = data?.quotes[symbol];
          const age = row ? health(row).ageSeconds : Infinity;
          return (
            symbol + " (" + (Number.isFinite(age) ? Math.floor(age) + "s" : "age unknown") + ")"
          );
        }),
    };
  }, [data, now, symbols]);
  return { quotes, indices, unavailable, data, feed };
}
