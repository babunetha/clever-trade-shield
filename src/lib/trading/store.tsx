import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getDhanMarketSnapshot } from "@/lib/market.functions";
import { buildIndices, buildQuotes, buildSignals, stepIndices, stepQuotes } from "./mock";
import { calculateRiskState, validateSignalRisk } from "./risk-engine";
import type {
  AuditEntry,
  AuditSeverity,
  IndexQuote,
  Outcome,
  Quote,
  RiskState,
  Settings,
  Signal,
  Trade,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  capital: 100000,
  maxRiskPerTrade: 500,
  maxDailyLoss: 1000,
  maxTradesPerDay: 3,
  weeklyLossLimit: 2500,
  maxOpenPositions: 2,
  lockAfterLosingTrades: 2,
  minRiskReward: 1.5,
  sessionStart: "09:20",
  sessionEnd: "15:10",
  allowFno: false,
  intradayOnly: true,
  liveExecutionEnabled: false,
  tradingEnabled: true,
};

const STORAGE_KEY = "inr1l-trading-assistant-v1";

interface Persisted {
  settings: Settings;
  signals: Signal[];
  trades: Trade[];
  audit: AuditEntry[];
}

interface Ctx extends Persisted {
  quotes: Quote[];
  indices: IndexQuote[];
  risk: RiskState;
  approveSignal: (id: string) => { ok: boolean; message: string };
  /** Logs an explicitly approved, verified scanner candidate as a simulated trade. */
  openPaperTrade: (input: {
    symbol: string;
    securityId?: string;
    name: string;
    entry: number;
    stopLoss: number;
    target1: number;
    quantity: number;
    riskRupees: number;
    source: string;
  }) => { ok: boolean; message: string };
  rejectSignal: (id: string, reason: string) => void;
  refreshSignals: () => void;
  publishLiveSignals: (signals: Signal[]) => void;
  closeTrade: (id: string, exit: number, notes?: string, exitReason?: "STOP" | "TARGET" | "MANUAL") => void;
  updateNotes: (id: string, notes: string) => void;
  saveSettings: (patch: Partial<Settings>) => void;
  setTradingEnabled: (enabled: boolean) => void;
  resetDay: () => void;
}

const TradingContext = createContext<Ctx | null>(null);

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.toDateString() === n.toDateString();
}

export function TradingProvider({ children }: { children: ReactNode }) {
  // Fixed seed: the first render must be identical on the server and in the
  // browser or hydration mismatches. Randomness only enters on later ticks.
  const seed = 20240101;
  const [quotes, setQuotes] = useState<Quote[]>(() => buildQuotes(seed));
  const [indices, setIndices] = useState<IndexQuote[]>(() => buildIndices(seed));
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const log = useCallback((action: string, detail: string, severity: AuditSeverity = "INFO") => {
    setAudit((prev) =>
      [{ id: uid("AUD"), at: new Date().toISOString(), actor: "operator", action, detail, severity }, ...prev].slice(0, 300),
    );
  }, []);

  // Restore persisted state on the client only.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings, liveExecutionEnabled: false });
        if (parsed.trades) setTrades(parsed.trades);
        if (parsed.audit) setAudit(parsed.audit);
        if (parsed.signals) setSignals(parsed.signals);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, signals, trades, audit }));
    } catch {
      /* storage full or unavailable */
    }
  }, [hydrated, settings, signals, trades, audit]);

  // Seed the first simulated signal batch after hydration.
  useEffect(() => {
    if (!hydrated) return;
    setSignals((prev) => {
      if (prev.length) return prev;
      return buildSignals({ seed, quotes, indices, maxRiskPerTrade: settings.maxRiskPerTrade });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // When paper positions are open, mark them from Dhan and simulate SL/target fills.
  // This is deliberately read-only: the client never calls an order endpoint.
  const tradesRef = useRef(trades);
  const closeTradeRef = useRef<Ctx["closeTrade"]>(() => undefined);

  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  useEffect(() => {
    closeTradeRef.current = closeTrade;
  }, [closeTrade]);

  // One stable poller avoids timer churn on every mark/P&L update.
  // Dhan quote reads are batched by symbol and polled at 3s, well below the
  // single-request-per-second quote rate when this client is the sole reader.
  useEffect(() => {
    if (!hydrated) return;
    const tick = async () => {
      const open = tradesRef.current.filter((t) => t.status === "OPEN");
      if (!open.length) return;
      try {
        const result = await getDhanMarketSnapshot({ data: { symbols: [...new Set(open.map((t) => t.symbol))] } });
        if (!result.ok) return;
        const quotes = result.data.quotes as Record<string, { ltp: number }>;
        setTrades((prev) => prev.map((trade) => {
          if (trade.status !== "OPEN") return trade;
          const price = quotes[trade.symbol]?.ltp;
          if (!Number.isFinite(price)) return trade;
          if (price <= trade.stopLoss) {
            void closeTradeRef.current?.(trade.id, trade.stopLoss, "Automatic paper fill: Dhan live mark crossed stop-loss", "STOP");
            return trade;
          }
          if (price >= trade.target1) {
            void closeTradeRef.current?.(trade.id, trade.target1, "Automatic paper fill: Dhan live mark crossed target", "TARGET");
            return trade;
          }
          return {
            ...trade,
            markPrice: price,
            unrealizedPnl: Number(((price - trade.entry) * trade.quantity * (trade.side === "LONG" ? 1 : -1)).toFixed(2)),
          };
        }));
      } catch {
        /* Dhan is optional; keep paper journal usable without it. */
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => window.clearInterval(timer);
  }, [hydrated]);

  // Simulated tick loop (clearly labelled as mock data in the UI).
  useEffect(() => {
    const t = window.setInterval(() => {
      setQuotes((prev) => stepQuotes(prev, Math.floor(Math.random() * 1e9)));
      setIndices((prev) => stepIndices(prev, Math.floor(Math.random() * 1e9)));
    }, 3000);
    return () => window.clearInterval(t);
  }, []);

  const risk = useMemo<RiskState>(() => calculateRiskState(trades, settings), [trades, settings]);

  const approveSignal = useCallback(
    (id: string) => {
      const signal = signals.find((s) => s.id === id);
      if (!signal) return { ok: false, message: "Signal not found" };
      if (signal.status !== "PENDING") return { ok: false, message: "Signal already decided" };
      const riskDecision = validateSignalRisk(signal, settings, risk);
      if (!riskDecision.allowed) {
        log("APPROVE_BLOCKED", signal.symbol + " blocked: " + riskDecision.reasons.join("; "), "WARN");
        return { ok: false, message: riskDecision.reasons[0] ?? "Risk validation failed" };
      }

      const now = new Date().toISOString();
      setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, status: "APPROVED", decidedAt: now } : s)));
      setTrades((prev) => [
        {
          id: uid("TRD"),
          signalId: signal.id,
          symbol: signal.symbol,
          name: signal.name,
          side: signal.side,
          entry: signal.entry,
          stopLoss: signal.stopLoss,
          target1: signal.target1,
          quantity: signal.quantity,
          status: "OPEN",
          openedAt: now,
          notes: "",
          simulated: true,
        },
        ...prev,
      ]);
      log(
        "SIGNAL_APPROVED",
        `${signal.side} ${signal.quantity} ${signal.symbol} @ ${signal.entry}, SL ${signal.stopLoss}, risk ₹${signal.riskRupees} — simulated only, no order sent`,
      );
      return { ok: true, message: "Approved — logged as a simulated trade. No live order was placed." };
    },
    [signals, risk, settings, log],
  );

  const openPaperTrade = useCallback<Ctx["openPaperTrade"]>(
    (input) => {
      if (risk.locked) {
        log("PAPER_TRADE_BLOCKED", `${input.symbol} blocked: ${risk.lockReasons.join("; ")}`, "WARN");
        return { ok: false, message: risk.lockReasons[0] ?? "Risk lock active" };
      }
      if (input.quantity <= 0) return { ok: false, message: "Computed quantity is zero" };
      if (input.riskRupees > settings.maxRiskPerTrade)
        return { ok: false, message: `Risk ₹${input.riskRupees} exceeds ₹${settings.maxRiskPerTrade} cap` };
      const openToday = trades.filter((t) => isToday(t.openedAt) && t.status === "OPEN").length;
      if (openToday >= settings.maxOpenPositions)
        return { ok: false, message: `Open-position cap ${settings.maxOpenPositions} reached` };

      const now = new Date().toISOString();
      setTrades((prev) => [
        {
          id: uid("TRD"),
          signalId: `SCAN-${input.source}`,
          securityId: input.securityId,
          symbol: input.symbol,
          name: input.name,
          side: "LONG",
          entry: input.entry,
          stopLoss: input.stopLoss,
          target1: input.target1,
          quantity: input.quantity,
          status: "OPEN",
          openedAt: now,
          notes: `Scanner candidate (${input.source}) — verified, simulated only`,
          simulated: true,
        },
        ...prev,
      ]);
      log(
        "PAPER_TRADE_OPENED",
        `LONG ${input.quantity} ${input.symbol} @ ${input.entry}, SL ${input.stopLoss}, risk ₹${input.riskRupees} from ${input.source} — simulated only, no order sent`,
      );
      return { ok: true, message: "Logged as a simulated paper trade. No live order was placed." };
    },
    [risk, settings, trades, log],
  );

  const rejectSignal = useCallback(
    (id: string, reason: string) => {
      setSignals((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: "REJECTED", decidedAt: new Date().toISOString(), rejectReason: reason } : s,
        ),
      );
      const s = signals.find((x) => x.id === id);
      log("SIGNAL_REJECTED", `${s?.symbol ?? id} rejected: ${reason || "no reason given"}`);
    },
    [signals, log],
  );

  const publishLiveSignals = useCallback(
    (liveSignals: Signal[]) => {
      setSignals(liveSignals.slice(0, 40));
      log("LIVE_SIGNALS_PUBLISHED", `${liveSignals.length} Dhan-derived signals published for manual approval`);
    },
    [log],
  );

  const refreshSignals = useCallback(() => {
    const fresh = buildSignals({
      seed: Math.floor(Math.random() * 1e9),
      quotes,
      indices,
      maxRiskPerTrade: settings.maxRiskPerTrade,
    });
    setSignals((prev) => [
      ...fresh,
      ...prev.map((s) => (s.status === "PENDING" ? { ...s, status: "EXPIRED" as const } : s)),
    ].slice(0, 40));
    log("SIGNALS_REFRESHED", `${fresh.length} simulated signals generated`);
  }, [quotes, indices, settings.maxRiskPerTrade, log]);

  const closeTrade = useCallback(
    (id: string, exit: number, notes?: string, exitReason: "STOP" | "TARGET" | "MANUAL" = "MANUAL") => {
      setTrades((prev) =>
        prev.map((t) => {
          if (t.id !== id || t.status === "CLOSED") return t;
          const dir = t.side === "LONG" ? 1 : -1;
          const pnl = Number(((exit - t.entry) * dir * t.quantity).toFixed(2));
          const perShareRisk = Math.abs(t.entry - t.stopLoss);
          const outcome: Outcome = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN";
          return {
            ...t,
            exit,
            pnl,
            rMultiple: perShareRisk ? Number((pnl / (perShareRisk * t.quantity)).toFixed(2)) : 0,
            outcome,
            exitReason,
            status: "CLOSED",
            closedAt: new Date().toISOString(),
            notes: notes ?? t.notes,
          };
        }),
      );
      log("TRADE_CLOSED", `Trade ${id} closed at ${exit} (simulated)`);
    },
    [log],
  );

  const updateNotes = useCallback((id: string, notes: string) => {
    setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, notes } : t)));
  }, []);

  const saveSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...patch, liveExecutionEnabled: false }));
      log("SETTINGS_UPDATED", Object.entries(patch).map(([k, v]) => `${k}=${String(v)}`).join(", "), "WARN");
    },
    [log],
  );

  const setTradingEnabled = useCallback(
    (enabled: boolean) => {
      setSettings((prev) => ({ ...prev, tradingEnabled: enabled }));
      log(enabled ? "TRADING_ENABLED" : "TRADING_DISABLED", enabled ? "Approvals re-enabled" : "Emergency disable: all approvals blocked", "CRITICAL");
    },
    [log],
  );

  const resetDay = useCallback(() => {
    setTrades([]);
    setSignals([]);
    log("DAY_RESET", "Simulated day reset: trades and signals cleared", "WARN");
  }, [log]);

  const value: Ctx = {
    settings,
    signals,
    trades,
    audit,
    quotes,
    indices,
    risk,
    approveSignal,
    openPaperTrade,
    rejectSignal,
    refreshSignals,
    publishLiveSignals,
    closeTrade,
    updateNotes,
    saveSettings,
    setTradingEnabled,
    resetDay,
  };

  return <TradingContext.Provider value={value}>{children}</TradingContext.Provider>;
}

export function useTrading() {
  const ctx = useContext(TradingContext);
  if (!ctx) throw new Error("useTrading must be used inside TradingProvider");
  return ctx;
}
