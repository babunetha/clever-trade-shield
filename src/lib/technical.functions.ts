import { createServerFn } from "@tanstack/react-start";
import { getDhanHistoricalCandles } from "./dhan.server";
import { resolveDhanInstruments } from "./market/instruments";
import { calculateIndicators } from "./trading/indicators";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function dateTime(daysAgo: number) {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - daysAgo * 86_400_000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} 09:15:00`;
}

export const getDhanTechnicalSnapshots = createServerFn({ method: "POST" })
  .inputValidator((input: { symbols?: string[]; interval?: "5" | "15" }) => ({
    symbols: (input?.symbols ?? []).map((s) => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 6),
    interval: input?.interval ?? "5",
  }))
  .handler(async ({ data }) => {
    const symbols = data.symbols;
    const instruments = await resolveDhanInstruments(symbols);
    const output: Record<string, unknown> = {};

    // Historical Data is a Data API. Keep requests paced rather than firing
    // a large burst from a scanner click.
    for (const instrument of instruments) {
      if (instrument.exchangeSegment !== "NSE_EQ" && instrument.exchangeSegment !== "BSE_EQ") continue;
      const five = await getDhanHistoricalCandles({
        securityId: instrument.securityId,
        exchangeSegment: instrument.exchangeSegment,
        instrument: "EQUITY",
        fromDate: dateTime(20),
        toDate: dateTime(0),
        interval: data.interval,
      });
      if (!five.ok) return five;
      const indicators = calculateIndicators(five.data);
      output[instrument.tradingSymbol] = {
        symbol: instrument.tradingSymbol,
        name: instrument.customSymbol,
        securityId: instrument.securityId,
        exchangeSegment: instrument.exchangeSegment,
        candles: five.data.length,
        asOf: five.data.at(-1)?.timestamp ?? null,
        indicators,
      };
      await sleep(220);
    }

    return { ok: true as const, data: output };
  });
