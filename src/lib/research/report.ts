import type { DailyBar } from "@/lib/scanner/series";
import { backtestTrendBreakout, walkForwardTrendBreakout } from "./backtest";

export interface ResearchReport {
  fullSample: ReturnType<typeof backtestTrendBreakout>;
  walkForward: ReturnType<typeof walkForwardTrendBreakout>;
  verdict: "RESEARCH_SUPPORTED" | "INSUFFICIENT_DATA" | "RESEARCH_WEAK";
}

export function buildResearchReport(bars: DailyBar[]): ResearchReport {
  const fullSample = backtestTrendBreakout(bars);
  const walkForward = walkForwardTrendBreakout(bars);
  if (bars.length < 240 || fullSample.trades < 20 || walkForward.outOfSample.trades < 5) {
    return { fullSample, walkForward, verdict: "INSUFFICIENT_DATA" };
  }
  const supported = walkForward.outOfSample.expectancyR > 0 && walkForward.stability.profitableRate >= 50;
  return { fullSample, walkForward, verdict: supported ? "RESEARCH_SUPPORTED" : "RESEARCH_WEAK" };
}
