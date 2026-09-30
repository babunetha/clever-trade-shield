import type { ScannerConfig, ScannerId } from "./definitions";
import type { DailyBar } from "./series";
import type { BacktestResult } from "@/lib/research/backtest";

export interface ScanCandidate {
  id: string;
  scannerId: ScannerId;
  scannerName: string;
  symbol: string;
  name: string;
  /** Last completed daily close from a verified scan source. */
  scanClose: number;
  matched: string[];
  scannedAt: string;
  bars: DailyBar[];
  research: BacktestResult & { score: number };
  /** Present for Dhan-backed candidates. */
  securityId?: string;
  /** Identifies the authoritative source used to create this candidate. */
  source?: "DHAN_LIVE";
}

/**
 * Legacy client-side scanner entry point.
 *
 * This function used to generate a synthetic market universe and random daily
 * history. That path is deliberately disabled. A trading candidate must come
 * from the Dhan-backed server scan so that prices, candles, indicators and
 * research evidence can be traced to real market data.
 *
 * Keep this function only as a compatibility guard for old callers. It fails
 * closed instead of returning simulated candidates.
 */
export function runScanners(_config: ScannerConfig, _seed?: number): ScanCandidate[] {
  throw new Error(
    "Synthetic scanner disabled. Run the Dhan-backed live research scan; no simulated market candidates are permitted.",
  );
}
