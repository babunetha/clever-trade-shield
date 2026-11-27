import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDhanPaperMarks } from "@/lib/paper-market.functions";
import { quoteHealth } from "@/lib/scanner/quote-health";
import {
  approvePaperTrade as approvePaperTradeFn,
  persistPaperTrade as persistPaperTradeFn,
  persistTradeAudit as persistTradeAuditFn,
  loadPaperRecords as loadPaperRecordsFn,
} from "@/lib/paper-storage.functions";
import { useDhanOverview } from "../market/use-dhan-overview";
import { calculateRiskState } from "./risk-engine";
import { enforceProfile } from "./safe-settings";
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
  approveSignal: (id: string) => Promise<{ ok: boolean; message: string }>;
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
    approvalId: string;
    dataSource: "DHAN_LIVE" | "SIMULATED";
  }) => Promise<{ ok: boolean; message: string }>;
  rejectSignal: (id: string, reason: string) => void;
  publishLiveSignals: (signals: Signal[]) => void;
  closeTrade: (
    id: string,
    exit: number,
    notes?: string,
    exitReason?: "STOP" | "TARGET" | "MANUAL",
  ) => void;
  updateNotes: (id: string, notes: string) => void;
  saveSettings: (patch: Partial<Settings>) => void;
  setTradingEnabled: (enabled: boolean) => void;
  resetDay: () => void;
  /** Appends an audit entry (and persists it server-side) from any screen. */
  log: (action: string, detail: string, severity?: AuditSeverity) => void;
}

const TradingContext = createContext<Ctx | null>(null);

const uid = (p: string) =>
  `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.toDateString() === n.toDateString();
}

export function TradingProvider({ children }: { children: ReactNode }) {
  const { quotes, indices } = useDhanOverview();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const approvedIds = useRef(new Set<string>());
  const approvePaperTradeServer = useServerFn(approvePaperTradeFn);
  const persistPaperTrade = useServerFn(persistPaperTradeFn);
  const persistTradeAudit = useServerFn(persistTradeAuditFn);
  const loadPaperRecords = useServerFn(loadPaperRecordsFn);

  const log = useCallback(
    (action: string, detail: string, severity: AuditSeverity = "INFO") => {
      const entry = {
        id: uid("AUD"),
        at: new Date().toISOString(),
        actor: "operator",
        action,
        detail,
        severity,
      };
      setAudit((prev) => [entry, ...prev].slice(0, 300));
      void persistTradeAudit({ data: entry }).catch(() => {});
    },
    [persistTradeAudit],
  );

  // Restore persisted state on the client only.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        if (parsed.settings)
          setSettings(enforceProfile({ ...DEFAULT_SETTINGS, ...parsed.settings }));
        if (Array.isArray(parsed.trades)) {
          setTrades(parsed.trades);
          tradesRef.current = parsed.trades;
          for (const trade of parsed.trades) approvedIds.current.add(trade.signalId);
        }
        if (parsed.audit) setAudit(parsed.audit);
        if (Array.isArray(parsed.signals)) setSignals(parsed.signals.filter((s) => s?.securityId));
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
    // Saved records on the server win over this browser's copy.
    void loadPaperRecords()
      .then((remote) => {
        const remoteTrades = (JSON.parse(remote.tradesJson) as Record<string, unknown>[]).filter(
          (t): t is Trade & Record<string, unknown> =>
            typeof t?.id === "string" && typeof t?.signalId === "string",
        ) as unknown as Trade[];
        if (remoteTrades.length) {
          setTrades((prev) => {
            const ids = new Set(remoteTrades.map((t) => t.id));
            const merged = [...remoteTrades, ...prev.filter((t) => !ids.has(t.id))].sort((a, b) =>
              b.openedAt.localeCompare(a.openedAt),
            );
            tradesRef.current = merged;
            for (const t of merged) approvedIds.current.add(t.signalId);
            return merged;
          });
        }
        if (remote.audit.length) {
          setAudit((prev) => {
            const ids = new Set(remote.audit.map((a) => a.id));
            const merged = [
              ...(remote.audit.map((a) => ({ ...a, actor: "operator" })) as AuditEntry[]),
              ...prev.filter((a) => !ids.has(a.id)),
            ];
            return merged.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
          });
        }
      })
      .catch(() => {
        /* offline or not signed in: keep this browser's copy */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ settings, signals, trades, audit }),
      );
    } catch {
      /* storage full or unavailable */
    }
  }, [hydrated, settings, signals, trades, audit]);

  // When paper positions are open, mark them from Dhan and simulate SL/target fills.
  // This is deliberately read-only: the client never calls an order endpoint.
  const tradesRef = useRef(trades);
  const closeTradeRef = useRef<Ctx["closeTrade"]>(() => undefined);

  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  // One stable poller avoids timer churn on every mark/P&L update.
  // Dhan quote reads are batched by Security ID and polled at 3s.
  useEffect(() => {
    if (!hydrated) return;
    const tick = async () => {
      const open = tradesRef.current.filter((t) => t.status === "OPEN");
      if (!open.length) return;
      try {
        const securityIds = [
          ...new Set(open.map((t) => t.securityId).filter((id): id is string => Boolean(id))),
        ];
        if (!securityIds.length) return;
        const result = await getDhanPaperMarks({ data: { securityIds } });
        if (!result.ok) return;
        const quotesBySecurityId = result.quotes as Record<
          string,
          { lastPrice: number; sourceTimestamp: string | null }
        >;
        const exits: Array<{
          id: string;
          price: number;
          notes: string;
          reason: "STOP" | "TARGET";
        }> = [];
        setTrades((prev) =>
          prev.map((trade) => {
            if (trade.status !== "OPEN") return trade;
            const quote = trade.securityId ? quotesBySecurityId[trade.securityId] : undefined;
            const price = quote?.lastPrice;
            if (
              !quote ||
              price === undefined ||
              !Number.isFinite(price) ||
              !quoteHealth(price, quote.sourceTimestamp ?? "").fresh
            )
              return trade;
            if (price <= trade.stopLoss) {
              exits.push({
                id: trade.id,
                price: trade.stopLoss,
                notes: "Automatic paper fill: Dhan live mark crossed stop-loss",
                reason: "STOP",
              });
              return trade;
            }
            if (price >= trade.target1) {
              exits.push({
                id: trade.id,
                price: trade.target1,
                notes: "Automatic paper fill: Dhan live mark crossed target",
                reason: "TARGET",
              });
              return trade;
            }
            return {
              ...trade,
              markPrice: price,
              unrealizedPnl: Number(
                ((price - trade.entry) * trade.quantity * (trade.side === "LONG" ? 1 : -1)).toFixed(
                  2,
                ),
              ),
            };
          }),
        );
        for (const exit of exits)
          closeTradeRef.current(exit.id, exit.price, exit.notes, exit.reason);
      } catch {
        /* Dhan is optional; keep paper journal usable without it. */
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => window.clearInterval(timer);
  }, [hydrated]);

  const risk = useMemo<RiskState>(() => calculateRiskState(trades, settings), [trades, settings]);

  const approveSignal = useCallback(
    async (id: string) => {
      const signal = signals.find((s) => s.id === id);
      if (!signal) return { ok: false, message: "Signal not found" };
      if (!signal.securityId)
        return { ok: false, message: "A verified Dhan instrument is required." };
      if (signal.status !== "PENDING") return { ok: false, message: "Signal already decided" };
      if (approvedIds.current.has(id)) return { ok: false, message: "Signal already approved" };
      try {
        const result = await approvePaperTradeServer({
          data: {
            approvalId: signal.id,
            symbol: signal.symbol,
            securityId: signal.securityId,
            name: signal.name,
            side: signal.side,
            entry: signal.entry,
            stopLoss: signal.stopLoss,
            target1: signal.target1,
            quantity: signal.quantity,
            source: "SignalCard",
            dataSource: "DHAN_LIVE",
          },
        });
        if (!result.ok) {
          log("APPROVE_BLOCKED", signal.symbol + " blocked: " + result.reason, "WARN");
          return { ok: false, message: result.reason };
        }
        const paperTrade = result.trade as Trade;
        const now = paperTrade.openedAt;
        approvedIds.current.add(id);
        setSignals((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "APPROVED", decidedAt: now } : s)),
        );
        setTrades((prev) => [paperTrade, ...prev]);
        tradesRef.current = [paperTrade, ...tradesRef.current];
        log(
          "SIGNAL_APPROVED",
          `${signal.side} ${signal.quantity} ${signal.symbol} @ ${paperTrade.entry}, SL ${paperTrade.stopLoss} — server-approved paper simulation only; no order sent`,
        );
        return {
          ok: true,
          message: "Server approved and saved the simulated paper trade. No broker order was sent.",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Server paper approval failed.";
        log("APPROVE_BLOCKED", signal.symbol + " blocked: " + message, "WARN");
        return { ok: false, message };
      }
    },
    [signals, log, approvePaperTradeServer],
  );

  const openPaperTrade = useCallback<Ctx["openPaperTrade"]>(
    async (input) => {
      if (approvedIds.current.has(input.approvalId))
        return { ok: false, message: "This paper approval was already recorded." };
      try {
        const result = await approvePaperTradeServer({
          data: {
            approvalId: input.approvalId,
            symbol: input.symbol,
            securityId: input.securityId,
            name: input.name,
            side: "LONG",
            entry: input.entry,
            stopLoss: input.stopLoss,
            target1: input.target1,
            quantity: input.quantity,
            source: input.source,
            dataSource: input.dataSource,
          },
        });
        if (!result.ok) {
          log("PAPER_TRADE_BLOCKED", `${input.symbol}: ${result.reason}`, "WARN");
          return { ok: false, message: result.reason };
        }
        const paperTrade = result.trade as Trade;
        approvedIds.current.add(input.approvalId);
        setTrades((prev) => [paperTrade, ...prev]);
        tradesRef.current = [paperTrade, ...tradesRef.current];
        log(
          "PAPER_TRADE_OPENED",
          `LONG ${paperTrade.quantity} ${paperTrade.symbol} @ ${paperTrade.entry}, SL ${paperTrade.stopLoss}, server-calculated risk — ${input.dataSource} paper simulation only; no order sent`,
        );
        return {
          ok: true,
          message: "Server approved and saved the simulated paper trade. No broker order was sent.",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Server paper approval failed.";
        log("PAPER_TRADE_BLOCKED", `${input.symbol}: ${message}`, "WARN");
        return { ok: false, message };
      }
    },
    [log, approvePaperTradeServer],
  );

  const rejectSignal = useCallback(
    (id: string, reason: string) => {
      setSignals((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                status: "REJECTED",
                decidedAt: new Date().toISOString(),
                rejectReason: reason,
              }
            : s,
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
      log(
        "LIVE_SIGNALS_PUBLISHED",
        `${liveSignals.length} Dhan-derived signals published for manual approval`,
      );
    },
    [log],
  );

  const closeTrade = useCallback(
    (
      id: string,
      exit: number,
      notes?: string,
      exitReason: "STOP" | "TARGET" | "MANUAL" = "MANUAL",
    ) => {
      const existing = trades.find((t) => t.id === id);
      if (!existing || existing.status === "CLOSED") return;
      const dir = existing.side === "LONG" ? 1 : -1;
      const pnl = Number(((exit - existing.entry) * dir * existing.quantity).toFixed(2));
      const perShareRisk = Math.abs(existing.entry - existing.stopLoss);
      const outcome: Outcome = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN";
      const closedTrade: Trade = {
        ...existing,
        exit,
        pnl,
        rMultiple: perShareRisk ? Number((pnl / (perShareRisk * existing.quantity)).toFixed(2)) : 0,
        outcome,
        exitReason,
        status: "CLOSED",
        closedAt: new Date().toISOString(),
        notes: notes ?? existing.notes,
      };
      setTrades((prev) => prev.map((t) => (t.id === id ? closedTrade : t)));
      void persistPaperTrade({
        data: {
          id: closedTrade.id,
          symbol: closedTrade.symbol,
          status: "CLOSED",
          openedAt: closedTrade.openedAt,
          closedAt: closedTrade.closedAt,
          payload: closedTrade as unknown as Record<string, unknown>,
        },
      }).catch(() => {});
      log("TRADE_CLOSED", `Trade ${id} closed at ${exit} (simulated)`);
    },
    [log, persistPaperTrade, trades],
  );

  closeTradeRef.current = closeTrade;

  const updateNotes = useCallback(
    (id: string, notes: string) => {
      setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, notes } : t)));
      const t = tradesRef.current.find((x) => x.id === id);
      if (!t) return;
      const updated = { ...t, notes };
      void persistPaperTrade({
        data: {
          id: updated.id,
          symbol: updated.symbol,
          status: updated.status === "CLOSED" ? "CLOSED" : "OPEN",
          openedAt: updated.openedAt,
          closedAt: updated.closedAt,
          payload: updated as unknown as Record<string, unknown>,
        },
      }).catch(() => {});
    },
    [persistPaperTrade],
  );

  const saveSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => enforceProfile({ ...prev, ...patch }));
      log(
        "SETTINGS_UPDATED",
        Object.entries(patch)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(", "),
        "WARN",
      );
    },
    [log],
  );

  const setTradingEnabled = useCallback(
    (enabled: boolean) => {
      setSettings((prev) => ({ ...prev, tradingEnabled: enabled }));
      log(
        enabled ? "TRADING_ENABLED" : "TRADING_DISABLED",
        enabled ? "Approvals re-enabled" : "Emergency disable: all approvals blocked",
        "CRITICAL",
      );
    },
    [log],
  );

  const resetDay = useCallback(() => {
    setTrades([]);
    tradesRef.current = [];
    approvedIds.current.clear();
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
    publishLiveSignals,
    closeTrade,
    updateNotes,
    saveSettings,
    setTradingEnabled,
    resetDay,
    log,
  };

  return <TradingContext.Provider value={value}>{children}</TradingContext.Provider>;
}

export function useTrading() {
  const ctx = useContext(TradingContext);
  if (!ctx) throw new Error("useTrading must be used inside TradingProvider");
  return ctx;
}
