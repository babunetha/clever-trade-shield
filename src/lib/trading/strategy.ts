import type { Indicators, Quote, Side } from "./types";

export interface StrategyContext { quote: Quote; indicators: Indicators; }
export interface StrategySignal { side: Side; score: number; rationale: string[]; }

export interface Strategy {
  readonly id: string;
  readonly name: string;
  evaluate(context: StrategyContext): StrategySignal | null;
}

export class EmaVwapMomentumStrategy implements Strategy {
  readonly id = "ema-vwap-momentum-v1";
  readonly name = "EMA + VWAP Momentum";

  evaluate({ quote, indicators }: StrategyContext): StrategySignal | null {
    const bullish = indicators.ema9 > indicators.ema20 && quote.ltp > indicators.vwap && indicators.rsi14 >= 50 && indicators.rsi14 <= 75 && indicators.adx >= 20 && indicators.relVolume >= 1.2;
    const bearish = indicators.ema9 < indicators.ema20 && quote.ltp < indicators.vwap && indicators.rsi14 <= 50 && indicators.rsi14 >= 25 && indicators.adx >= 20 && indicators.relVolume >= 1.2;
    if (!bullish && !bearish) return null;
    const side: Side = bullish ? "LONG" : "SHORT";
    return {
      side,
      score: Math.min(100, 50 + (indicators.adx >= 25 ? 15 : 8) + (indicators.relVolume >= 1.5 ? 15 : 8) + (bullish ? 10 : 5)),
      rationale: [
        "EMA9/EMA20: " + indicators.ema9 + "/" + indicators.ema20,
        "Price vs VWAP: " + (quote.ltp > indicators.vwap ? "above" : "below"),
        "RSI14: " + indicators.rsi14,
        "ADX: " + indicators.adx,
        "Relative volume: " + indicators.relVolume + "x",
      ],
    };
  }
}
