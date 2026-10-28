import { describe, expect, test } from "bun:test";
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