import { describe, expect, test } from "bun:test";
import { parseDhanLastTradeTime } from "../src/lib/dhan.server";
import { quoteHealth } from "../src/lib/scanner/quote-health";

describe("fail-closed quote health", () => {
  const now = Date.parse("2026-10-28T04:30:00Z");
  test("quotes older than 20 seconds block approval", () => {
    expect(quoteHealth(100, new Date(now - 20000).toISOString(), now).fresh).toBe(true);
    expect(quoteHealth(100, new Date(now - 20001).toISOString(), now).fresh).toBe(false);
  });
  test("invalid timestamps block approval", () => {
    expect(quoteHealth(100, "not-a-date", now).fresh).toBe(false);
  });
  test("future timestamps block approval", () => {
    expect(quoteHealth(100, new Date(now + 1).toISOString(), now).fresh).toBe(false);
  });
  test("non-finite or non-positive prices block approval", () => {
    for (const price of [NaN, Infinity, 0, -1])
      expect(quoteHealth(price, new Date(now).toISOString(), now).fresh).toBe(false);
  });
});


describe("Dhan provider timestamps", () => {
  test("parses Dhan local timestamps as Asia/Kolkata time", () => {
    expect(parseDhanLastTradeTime("20/11/2026 10:30:00")).toBe("2026-11-20T05:00:00.000Z");
  });
  test("does not replace a sentinel/old provider time with fetch time", () => {
    const sourceTime = parseDhanLastTradeTime("01/01/1980 00:00:00");
    expect(sourceTime).toBe("1979-12-31T18:30:00.000Z");
    expect(quoteHealth(100, sourceTime ?? "", Date.parse("2026-11-20T05:00:00.000Z")).fresh).toBe(false);
  });
  test("missing provider timestamps fail closed", () => {
    expect(parseDhanLastTradeTime(undefined)).toBeNull();
    expect(quoteHealth(100, "", Date.parse("2026-11-20T05:00:00.000Z")).fresh).toBe(false);
  });
});
