import { getDhanQuote, type DhanQuote, type DhanResult } from "./dhan.server";
import { resolveDhanInstruments, type DhanInstrument } from "./market/instruments";
import { quoteHealth } from "./scanner/quote-health";

export interface MarketDataPoint {
  symbol: string;
  name: string;
  securityId: string;
  exchangeSegment: DhanInstrument["exchangeSegment"];
  ltp: number;
  prevClose: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  averagePrice: number;
  sourceTimestamp: string | null;
  fetchedAt: string;
}

export interface MarketDataSnapshot {
  provider: "DHAN";
  asOf: string;
  quotes: Record<string, MarketDataPoint>;
  requestedSymbols: string[];
  resolvedSymbols: string[];
  missingSymbols: string[];
}

export type MarketDataEngineResult = DhanResult<MarketDataSnapshot>;

function normalizeSymbols(symbols: string[]): string[] {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].slice(
    0,
    1000,
  );
}

function toPoint(instrument: DhanInstrument, quote: DhanQuote): MarketDataPoint {
  const prevClose = quote.close;
  const change = quote.netChange || (prevClose ? quote.lastPrice - prevClose : 0);

  return {
    symbol: instrument.tradingSymbol,
    name: instrument.customSymbol || instrument.tradingSymbol,
    securityId: instrument.securityId,
    exchangeSegment: instrument.exchangeSegment,
    ltp: quote.lastPrice,
    prevClose,
    change,
    changePct: prevClose ? (change / prevClose) * 100 : 0,
    dayHigh: quote.high,
    dayLow: quote.low,
    volume: quote.volume,
    averagePrice: quote.averagePrice,
    sourceTimestamp: quote.sourceTimestamp,
    fetchedAt: new Date().toISOString(),
  };
}

export class DhanMarketDataEngine {
  async snapshot(inputSymbols: string[]): Promise<MarketDataEngineResult> {
    const requestedSymbols = normalizeSymbols(inputSymbols);

    if (!requestedSymbols.length) {
      return {
        ok: true,
        data: {
          provider: "DHAN",
          asOf: new Date().toISOString(),
          quotes: {},
          requestedSymbols: [],
          resolvedSymbols: [],
          missingSymbols: [],
        },
      };
    }

    const instruments = (await resolveDhanInstruments(requestedSymbols)).filter(
      (instrument) =>
        (instrument.exchangeSegment === "NSE_EQ" && instrument.instrument === "EQUITY") ||
        (instrument.exchangeSegment === "IDX_I" && instrument.instrument === "INDEX"),
    );

    const grouped = new Map<DhanInstrument["exchangeSegment"], DhanInstrument[]>();
    for (const instrument of instruments) {
      const group = grouped.get(instrument.exchangeSegment) ?? [];
      group.push(instrument);
      grouped.set(instrument.exchangeSegment, group);
    }

    const quotes: Record<string, MarketDataPoint> = {};

    for (const [segment, segmentInstruments] of grouped) {
      if (segment !== "NSE_EQ" && segment !== "BSE_EQ" && segment !== "IDX_I") continue;

      const result = await getDhanQuote({
        securityIds: segmentInstruments.map((instrument) => instrument.securityId),
        exchangeSegment: segment,
      });

      if (!result.ok) return result;

      for (const instrument of segmentInstruments) {
        const quote = result.data[instrument.securityId];
        if (
          !quote ||
          !quote.sourceTimestamp ||
          !quoteHealth(quote.lastPrice, quote.sourceTimestamp).fresh
        ) continue;
        quotes[instrument.tradingSymbol] = toPoint(instrument, quote);
      }
    }

    return {
      ok: true,
      data: {
        provider: "DHAN",
        asOf: new Date().toISOString(),
        quotes,
        requestedSymbols,
        resolvedSymbols: Object.keys(quotes),
        missingSymbols: requestedSymbols.filter((symbol) => !quotes[symbol]),
      },
    };
  }
}

export const dhanMarketDataEngine = new DhanMarketDataEngine();
