export type Side = "LONG" | "SHORT";
export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";
export type SignalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
export type TradeStatus = "OPEN" | "CLOSED";
export type Outcome = "WIN" | "LOSS" | "BREAKEVEN";

export interface Indicators {
  ema9: number;
  ema20: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  vwap: number;
  adx: number;
  atr14: number;
  volume: number;
  avgVolume: number;
  relVolume: number;
  support: number;
  resistance: number;
  context5m: Bias;
  context15m: Bias;
}

export interface Quote {
  symbol: string;
  name: string;
  ltp: number;
  prevClose: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
}

export interface IndexQuote extends Quote {
  bias: Bias;
}

export interface Signal {
  id: string;
  /** Dhan Security ID when the signal originated from live broker data. */
  securityId?: string;
  symbol: string;
  name: string;
  side: Side;
  ltp: number;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  quantity: number;
  riskRupees: number;
  rewardRupees: number;
  riskReward: number;
  confidence: number;
  score: number;
  rationale: string[];
  indicators: Indicators;
  niftyBias: Bias;
  bankNiftyBias: Bias;
  generatedAt: string;
  expiresAt: string;
  status: SignalStatus;
  decidedAt?: string;
  rejectReason?: string;
}

export interface Trade {
  id: string;
  signalId: string;
  /** Dhan Security ID when the trade originated from a live-data scan. */
  securityId?: string;
  symbol: string;
  name: string;
  side: Side;
  entry: number;
  stopLoss: number;
  target1: number;
  quantity: number;
  exit?: number;
  pnl?: number;
  /** Current Dhan mark for an open paper position. */
  markPrice?: number;
  unrealizedPnl?: number;
  rMultiple?: number;
  exitReason?: "STOP" | "TARGET" | "MANUAL";
  outcome?: Outcome;
  status: TradeStatus;
  openedAt: string;
  closedAt?: string;
  notes: string;
  simulated: true;
}

export type AuditSeverity = "INFO" | "WARN" | "CRITICAL";

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
  severity: AuditSeverity;
}

export interface Settings {
  capital: number;
  maxRiskPerTrade: number;
  maxDailyLoss: number;
  maxTradesPerDay: number;
  /** Rolling 7-day realised-loss cap. */
  weeklyLossLimit: number;
  /** Simultaneous open positions allowed. */
  maxOpenPositions: number;
  lockAfterLosingTrades: number;
  minRiskReward: number;
  sessionStart: string;
  sessionEnd: string;
  allowFno: boolean;
  intradayOnly: boolean;
  /** Hard-disabled in v1: no live orders are ever placed. */
  liveExecutionEnabled: false;
  tradingEnabled: boolean;
}

export interface RiskState {
  realisedPnl: number;
  weeklyRealisedPnl: number;
  openRisk: number;
  openPositions: number;
  tradesToday: number;
  losingTradesToday: number;
  winningTradesToday: number;
  riskUsed: number;
  riskBudgetLeft: number;
  lossBudgetLeft: number;
  tradesLeft: number;
  locked: boolean;
  lockReasons: string[];
  equity: number;
}
