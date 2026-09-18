import type { IndexQuote, Quote } from "./types";

export interface MarketDataProvider {
  readonly name: string;
  getQuotes(symbols?: string[]): Promise<Quote[]>;
  getIndices(): Promise<IndexQuote[]>;
  getLtp(securityIds: string[]): Promise<Array<{ securityId: string; lastPrice: number }>>;
}

export class MockMarketDataProvider implements MarketDataProvider {
  readonly name = "SIMULATED";
  constructor(private readonly quotes: Quote[], private readonly indices: IndexQuote[]) {}
  async getQuotes(symbols?: string[]) {
    if (!symbols?.length) return this.quotes;
    const wanted = new Set(symbols);
    return this.quotes.filter((q) => wanted.has(q.symbol));
  }
  async getIndices() { return this.indices; }
  async getLtp() { return []; }
}
