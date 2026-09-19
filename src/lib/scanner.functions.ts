import { createServerFn } from "@tanstack/react-start";

export interface ScannerLiveQuote {
  symbol: string;
  price: number;
  securityId: string;
}

export type ScannerLiveQuotesResult =
  | { ok: true; source: "DHAN_LIVE"; asOf: string; quotes: ScannerLiveQuote[]; missing: string[] }
  | { ok: false; code: string; error: string };

/**
 * Live LTP for the scanner's candidate symbols only (never the whole universe).
 * Server-only: credentials are read inside the handler and never returned.
 */
export const getScannerLiveQuotes = createServerFn({ method: "POST" })
  .inputValidator((input: { symbols: string[] }) => ({
    symbols: (Array.isArray(input?.symbols) ? input.symbols : [])
      .map((s) => String(s).trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 50),
  }))
  .handler(async ({ data }): Promise<ScannerLiveQuotesResult> => {
    const { readDhanCredentialStatus, getDhanLtp } = await import("./dhan.server");
    const status = readDhanCredentialStatus();
    if (!status.clientIdConfigured || !status.accessTokenConfigured) {
      return {
        ok: false,
        code: "NOT_CONFIGURED",
        error: "Dhan credentials are not configured on the server, so live prices are unavailable.",
      };
    }
    if (!data.symbols.length) {
      return { ok: true, source: "DHAN_LIVE", asOf: new Date().toISOString(), quotes: [], missing: [] };
    }

    const { resolveDhanInstruments } = await import("./market/instruments");
    let instruments: Awaited<ReturnType<typeof resolveDhanInstruments>>;
    try {
      instruments = await resolveDhanInstruments(data.symbols);
    } catch {
      return { ok: false, code: "INSTRUMENTS", error: "Could not load the Dhan instrument list. Try again shortly." };
    }

    const equity = instruments.filter((i) => i.exchangeSegment === "NSE_EQ");
    if (!equity.length) {
      return { ok: false, code: "NO_INSTRUMENTS", error: "None of the candidate symbols resolved to an NSE equity." };
    }

    const result = await getDhanLtp({
      securityIds: equity.map((i) => i.securityId),
      exchangeSegment: "NSE_EQ",
    });
    if (!result.ok) return { ok: false, code: result.code, error: result.error };

    const quotes: ScannerLiveQuote[] = [];
    for (const instrument of equity) {
      const price = result.data[instrument.securityId];
      if (typeof price === "number" && price > 0) {
        quotes.push({ symbol: instrument.tradingSymbol.toUpperCase(), price, securityId: instrument.securityId });
      }
    }
    const found = new Set(quotes.map((q) => q.symbol));
    return {
      ok: true,
      source: "DHAN_LIVE",
      asOf: new Date().toISOString(),
      quotes,
      missing: data.symbols.filter((s) => !found.has(s)),
    };
  });
