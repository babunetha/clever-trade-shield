import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";
import { getDhanHistoricalCandles, getDhanQuote } from "./dhan.server";
import { resolveDhanInstruments } from "./market/instruments";
import { calculateIndicators } from "./trading/indicators";
import { quoteHealth } from "./scanner/quote-health";
import type { Bias, Signal, Side } from "./trading/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (v: number, dp = 2) => Number(v.toFixed(dp));

function dateTime(daysAgo: number) {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - daysAgo * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} 09:15:00`;
}

function makeBias(changePct: number): Bias {
  return changePct > 0.25 ? "BULLISH" : changePct < -0.25 ? "BEARISH" : "NEUTRAL";
}

export const getDhanLiveSignals = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { symbols?: string[]; maxRiskPerTrade?: number }) => ({
    symbols: (input?.symbols ?? [])
      .map((s) => String(s).trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 6),
    maxRiskPerTrade: Math.max(1, Number(input?.maxRiskPerTrade ?? 500)),
  }))
  .handler(async ({ data }) => {
    const currentIstMinute = (Math.floor(Date.now() / 1000) + 19_800) % 86_400 / 60;
    if (currentIstMinute < 555 || currentIstMinute > 930) {
      return {
        ok: false as const,
        code: "OUT_OF_SESSION",
        error: "Fresh intraday signals are unavailable outside the NSE cash session.",
      };
    }
    const symbols = data.symbols.length ? data.symbols : ["RELIANCE", "HDFCBANK", "INFY", "SBIN"];
    const instruments = await resolveDhanInstruments([...symbols, "NIFTY", "BANKNIFTY"]);
    const equity = instruments.filter(
      (x) => x.exchangeSegment === "NSE_EQ" && x.instrument === "EQUITY",
    );
    const indices = instruments.filter(
      (x) => x.exchangeSegment === "IDX_I" && x.instrument === "INDEX",
    );
    const groups = new Map<string, string[]>();
    for (const item of [...equity, ...indices]) {
      const ids = groups.get(item.exchangeSegment) ?? [];
      ids.push(item.securityId);
      groups.set(item.exchangeSegment, ids);
    }

    const quotes: Record<string, { ltp: number; close: number; netChange: number; sourceTimestamp: string }> = {};
    for (const [segment, ids] of groups) {
      const q = await getDhanQuote({
        securityIds: ids,
        exchangeSegment: segment as "NSE_EQ" | "IDX_I",
      });
      if (!q.ok) return q;
      for (const value of Object.values(q.data)) {
        if (
          !value.sourceTimestamp ||
          !quoteHealth(value.lastPrice, value.sourceTimestamp).fresh
        ) continue;
        quotes[value.securityId] = {
          ltp: value.lastPrice,
          close: value.close,
          netChange: value.netChange,
          sourceTimestamp: value.sourceTimestamp,
        };
      }
    }

    const bySymbol = new Map(instruments.map((x) => [x.tradingSymbol, x]));
    const nifty = bySymbol.get("NIFTY");
    const bank = bySymbol.get("BANKNIFTY");
    const niftyQuote = nifty ? quotes[nifty.securityId] : undefined;
    const bankQuote = bank ? quotes[bank.securityId] : undefined;
    if (!niftyQuote || !bankQuote) {
      return {
        ok: false as const,
        code: "INDEX_DATA_STALE",
        error: "Fresh NIFTY and BANKNIFTY provider quotes are required for market context.",
      };
    }
    const niftyBias = niftyQuote
      ? makeBias(niftyQuote.close ? (niftyQuote.netChange / niftyQuote.close) * 100 : 0)
      : "NEUTRAL";
    const bankNiftyBias = bankQuote
      ? makeBias(bankQuote.close ? (bankQuote.netChange / bankQuote.close) * 100 : 0)
      : "NEUTRAL";

    const signals: Signal[] = [];
    for (const instrument of equity) {
      const q = quotes[instrument.securityId];
      if (!q) continue;
      const candles = await getDhanHistoricalCandles({
        securityId: instrument.securityId,
        exchangeSegment: "NSE_EQ",
        instrument: "EQUITY",
        fromDate: dateTime(20),
        toDate: dateTime(0),
        interval: "5",
      });
      if (!candles.ok) return candles;
      const latestCandle = candles.data.at(-1);
      const candleAgeSeconds = latestCandle
        ? Math.floor(Date.now() / 1000) - latestCandle.timestamp
        : Number.POSITIVE_INFINITY;
      if (
        !latestCandle ||
        candleAgeSeconds < 0 ||
        candleAgeSeconds > 10 * 60
      ) {
        await sleep(220);
        continue;
      }
      const indicators = calculateIndicators(candles.data);
      if (!indicators) {
        await sleep(220);
        continue;
      }

      const bullish =
        indicators.ema9 > indicators.ema20 &&
        indicators.ema20 > indicators.ema50 &&
        q.ltp > indicators.vwap &&
        indicators.rsi14 >= 50 &&
        indicators.rsi14 <= 75 &&
        indicators.macdHist > 0 &&
        indicators.adx >= 20 &&
        indicators.relVolume >= 1.2;
      const bearish =
        indicators.ema9 < indicators.ema20 &&
        indicators.ema20 < indicators.ema50 &&
        q.ltp < indicators.vwap &&
        indicators.rsi14 <= 50 &&
        indicators.rsi14 >= 25 &&
        indicators.macdHist < 0 &&
        indicators.adx >= 20 &&
        indicators.relVolume >= 1.2;
      if (!bullish && !bearish) {
        await sleep(220);
        continue;
      }

      const side: Side = bullish ? "LONG" : "SHORT";
      const riskPerShare = Math.max(indicators.atr14 * 1.2, q.ltp * 0.004);
      const stopLoss = side === "LONG" ? q.ltp - riskPerShare : q.ltp + riskPerShare;
      const target1 = side === "LONG" ? q.ltp + riskPerShare * 1.8 : q.ltp - riskPerShare * 1.8;
      const target2 = side === "LONG" ? q.ltp + riskPerShare * 2.6 : q.ltp - riskPerShare * 2.6;
      const quantity = Math.max(0, Math.floor(data.maxRiskPerTrade / riskPerShare));
      if (!quantity) {
        await sleep(220);
        continue;
      }
      const riskRupees = round(quantity * riskPerShare);
      const score = Math.min(
        100,
        Math.round(
          50 +
            (indicators.ema9 > indicators.ema20 === bullish ? 10 : 0) +
            (indicators.ema20 > indicators.ema50 === bullish ? 10 : 0) +
            (indicators.macdHist > 0 === bullish ? 10 : 0) +
            (indicators.relVolume >= 1.5 ? 10 : 5) +
            (indicators.adx >= 25 ? 10 : 5),
        ),
      );

      signals.push({
        id: `LIVE-${instrument.tradingSymbol}-${Date.now()}`,
        securityId: instrument.securityId,
        symbol: instrument.tradingSymbol,
        name: instrument.customSymbol,
        side,
        ltp: q.ltp,
        entry: round(q.ltp),
        stopLoss: round(stopLoss),
        target1: round(target1),
        target2: round(target2),
        quantity,
        riskRupees,
        rewardRupees: round(quantity * Math.abs(target1 - q.ltp)),
        riskReward: round(Math.abs(target1 - q.ltp) / riskPerShare, 2),
        confidence: score,
        score,
        rationale: [
          `EMA trend ${indicators.ema9}/${indicators.ema20}/${indicators.ema50}`,
          `RSI(14) ${indicators.rsi14}; MACD histogram ${indicators.macdHist}`,
          `Price ${side === "LONG" ? "above" : "below"} VWAP ${indicators.vwap}`,
          `ADX ${indicators.adx}; relative volume ${indicators.relVolume}x`,
          `Nifty ${niftyBias}; Bank Nifty ${bankNiftyBias}`,
          "Derived from fresh Dhan 5-minute candles and provider-timestamped quotes",
          "Rule-based setup score; not a win-probability estimate",
        ],
        indicators,
        niftyBias,
        bankNiftyBias,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        status: "PENDING",
      });
      await sleep(220);
    }

    return { ok: true as const, data: { asOf: new Date().toISOString(), signals } };
  });
