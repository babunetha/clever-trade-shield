import { describe, expect, test } from "bun:test";
import { buildResearchIdea, validateCandles, mayHandoff, type Candle } from "../src/lib/research/engine";
import { getDhanLtp, getDhanQuote } from "../src/lib/dhan.server";

const now = Date.parse("2026-11-08T09:49:00Z");
const candles: Candle[] = Array.from({ length: 240 }, (_, i) => ({ timestamp: Math.floor(now / 1000) - (240 - i) * 86400, open: 100 + i, high: 103 + i, low: 99 + i, close: 102 + i, volume: 1000000 }));
describe("research safety", () => {
  test("bad OHLC evidence cannot enter CTS watchlist", () => {
    const bad = candles.map(c => ({ ...c })); bad[50] = { ...bad[50], high: 1 };
    const idea = buildResearchIdea({ securityId: "1333", tradingSymbol: "HDFCBANK", customSymbol: "HDFC Bank" }, bad, new Date(now).toISOString());
    expect(idea.verdict).toBe("NO_TRADE"); expect(mayHandoff(idea)).toBe(false);
  });
  test("duplicate timestamps block history", () => {
    expect(validateCandles([...candles, candles[239]], now).errors).toContain("Duplicate or unordered timestamp");
  });
  test("today's daily candle is excluded before IST close", () => {
    const opening = Date.parse("2026-11-09T03:45:00Z") / 1000;
    const result = validateCandles([{ ...candles[239], timestamp: opening }], Date.parse("2026-11-09T09:49:00Z"));
    expect(result.completed).toHaveLength(0);
  });
  test("valid daily evidence never grants TRADE without intraday confirmation", () => {
    const idea = buildResearchIdea({ securityId: "1333", tradingSymbol: "HDFCBANK", customSymbol: "HDFC Bank" }, candles, new Date(now).toISOString());
    expect(idea.verdict).toBe("WAIT"); expect(idea.evidence.find(e => e.field === "live_quote")?.status).toBe("NOT_AVAILABLE");
    expect(mayHandoff(idea)).toBe(true);
  });
  test("numeric IDs reach Dhan quotes and error 806 is distinguished from invalid credentials", async () => {
    const original = globalThis.fetch;
    const client = process.env.DHAN_CLIENT_ID; const token = process.env.DHAN_ACCESS_TOKEN;
    process.env.DHAN_CLIENT_ID = "test-client"; process.env.DHAN_ACCESS_TOKEN = "test-token";
    const bodies: unknown[] = [];
    globalThis.fetch = (async (_input, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ data: { "806": "Data APIs not Subscribed" } }), { status: 401 }); }) as typeof fetch;
    try {
      const ltp = await getDhanLtp({ securityIds: ["1333"] }); const quote = await getDhanQuote({ securityIds: ["1333"] });
      expect(bodies).toEqual([{ NSE_EQ: [1333] }, { NSE_EQ: [1333] }]);
      expect(ltp.ok).toBe(false); expect(quote.ok).toBe(false);
      if (!ltp.ok) expect(ltp.code).toBe("DATA_NOT_SUBSCRIBED");
    } finally { globalThis.fetch = original; if (client === undefined) delete process.env.DHAN_CLIENT_ID; else process.env.DHAN_CLIENT_ID = client; if (token === undefined) delete process.env.DHAN_ACCESS_TOKEN; else process.env.DHAN_ACCESS_TOKEN = token; }
  });
});