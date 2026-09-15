import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTrading } from "@/lib/trading/store";
import { evaluateSignal, verdictClasses } from "@/lib/trading/verdict";
import { formatINR, formatPrice, formatTime } from "@/lib/trading/format";
import type { Signal } from "@/lib/trading/types";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2.5 py-1.5">
      <div className="label-caps">{label}</div>
      <div className="num text-sm">{value}</div>
      {hint ? <div className="text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

const biasTone = (b: string) =>
  b === "BULLISH" ? "text-bull" : b === "BEARISH" ? "text-bear" : "text-muted-foreground";

export function SignalCard({ signal, showActions = true }: { signal: Signal; showActions?: boolean }) {
  const { settings, risk, approveSignal, rejectSignal } = useTrading();
  const [reason, setReason] = useState("");
  const { verdict, reasons, invalidation } = evaluateSignal(signal, settings, risk);
  const ind = signal.indicators;
  const decided = signal.status !== "PENDING";

  const onApprove = () => {
    const res = approveSignal(signal.id);
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  };

  return (
    <article className="panel p-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{signal.symbol}</h3>
            <Badge variant="outline" className="num">
              {signal.side === "LONG" ? (
                <ArrowUpRight className="mr-1 size-3 text-bull" />
              ) : (
                <ArrowDownRight className="mr-1 size-3 text-bear" />
              )}
              {signal.side}
            </Badge>
            <Badge variant="secondary" className="num">
              {signal.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {signal.name} · LTP {formatPrice(signal.ltp)} · generated {formatTime(signal.generatedAt)} · expires{" "}
            {formatTime(signal.expiresAt)}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold tracking-wide ${verdictClasses[verdict]}`}>
            {verdict}
          </span>
          <span className="num text-xs text-muted-foreground">score {signal.score}/100</span>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Entry" value={formatPrice(signal.entry)} />
        <Metric label="Stop loss" value={formatPrice(signal.stopLoss)} hint="hard invalidation" />
        <Metric label="Target 1" value={formatPrice(signal.target1)} />
        <Metric label="Target 2" value={formatPrice(signal.target2)} />
        <Metric label="R:R" value={`${signal.riskReward}`} hint={`min ${settings.minRiskReward}`} />
        <Metric
          label="Qty / risk"
          value={`${signal.quantity} · ${formatINR(signal.riskRupees)}`}
          hint={`cap ${formatINR(settings.maxRiskPerTrade)}`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Metric label="EMA 9 / 20" value={`${formatPrice(ind.ema9)} / ${formatPrice(ind.ema20)}`} />
        <Metric label="EMA 50 / 200" value={`${formatPrice(ind.ema50)} / ${formatPrice(ind.ema200)}`} />
        <Metric label="RSI 14" value={`${ind.rsi14}`} />
        <Metric label="MACD" value={`${ind.macdLine} / ${ind.macdSignal}`} hint={`hist ${ind.macdHist}`} />
        <Metric label="VWAP" value={formatPrice(ind.vwap)} />
        <Metric label="ADX" value={`${ind.adx}`} />
        <Metric label="Volume" value={ind.volume.toLocaleString("en-IN")} hint={`${ind.relVolume}x avg`} />
        <Metric label="Support" value={formatPrice(ind.support)} />
        <Metric label="Resistance" value={formatPrice(ind.resistance)} />
        <Metric label="5m context" value={ind.context5m} />
        <Metric label="15m context" value={ind.context15m} />
        <Metric label="Index bias" value={`N ${signal.niftyBias[0]} · BN ${signal.bankNiftyBias[0]}`} />
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <span className={biasTone(signal.niftyBias)}>Nifty: {signal.niftyBias}</span>
        <span className={biasTone(signal.bankNiftyBias)}>Bank Nifty: {signal.bankNiftyBias}</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="label-caps">Why this verdict</h4>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {reasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
          <h4 className="label-caps mt-3">Setup rationale</h4>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {signal.rationale.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="label-caps flex items-center gap-1">
            <AlertTriangle className="size-3 text-warn" /> Invalidation
          </h4>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {invalidation.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </div>
      </div>

      {signal.rejectReason ? (
        <p className="mt-3 text-xs text-bear">Rejected: {signal.rejectReason}</p>
      ) : null}

      {showActions && !decided ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={verdict === "AVOID"}>
                <Check className="mr-1 size-3.5" /> Approve manually
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm simulated trade</AlertDialogTitle>
                <AlertDialogDescription>
                  {signal.side} {signal.quantity} {signal.symbol} at {formatPrice(signal.entry)}, stop{" "}
                  {formatPrice(signal.stopLoss)}, risk {formatINR(signal.riskRupees)}. This is logged as a simulated
                  trade only — no live order is ever sent to any broker.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onApprove}>Yes, log simulated trade</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason"
            className="h-9 w-48"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              rejectSignal(signal.id, reason);
              toast.info(`${signal.symbol} rejected`);
              setReason("");
            }}
          >
            <X className="mr-1 size-3.5" /> Reject
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Nothing executes until you approve. Approval logs a simulated fill only.
          </span>
        </div>
      ) : null}
    </article>
  );
}
