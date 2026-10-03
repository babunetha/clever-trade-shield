import { Activity, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatTime } from "@/lib/trading/format";
import { MAX_TICK_AGE_SECONDS, type VerificationResult } from "@/lib/scanner/verify";

export interface QuoteHealthRow {
  symbol: string;
  scanClose: number;
  verification: VerificationResult;
  price: number;
  source: "DHAN_LIVE" | "SIMULATED";
  asOf: string;
  missingFromFeed: boolean;
}

export type ConnectionState = "LIVE" | "CONNECTING" | "ERROR" | "NOT_CONFIGURED" | "SIMULATED";

interface Props {
  rows: QuoteHealthRow[];
  connection: ConnectionState;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  errorMessage: string | null;
  failureCount: number;
  isFetching: boolean;
  scanAgeSeconds: number;
  scanStaleAfter: number;
  nowMs: number;
  onReconnect: () => void;
  onRescan: () => void;
  canReconnect: boolean;
}

/** Every reason paper trading is blocked for one candidate, most important first. */
export function paperBlockReasons(row: QuoteHealthRow, scanAgeSeconds: number, scanStaleAfter: number): string[] {
  const reasons: string[] = [];
  const v = row.verification;
  if (scanAgeSeconds > scanStaleAfter)
    reasons.push(`Scan results are ${scanAgeSeconds}s old (limit ${scanStaleAfter}s). Re-run the scan.`);
  if (v.freshnessSeconds > MAX_TICK_AGE_SECONDS)
    reasons.push(
      `${row.source === "DHAN_LIVE" ? "Dhan live" : "Simulated"} price is ${v.freshnessSeconds}s old (limit ${MAX_TICK_AGE_SECONDS}s). Reconnect prices.`,
    );
  if (row.missingFromFeed) reasons.push("Dhan returned no price for this symbol; using a simulated fallback.");
  for (const c of v.checks) {
    if (!c.ok && c.blocking && c.label !== "Price freshness") reasons.push(`${c.label}: ${c.detail}`);
  }
  if (reasons.length === 0 && v.state !== "BUY CANDIDATE")
    reasons.push(`Verification is ${v.state} — too few non-blocking checks passed (${v.passed}/${v.total}).`);
  return reasons;
}

const connectionBadge: Record<ConnectionState, { label: string; cls: string }> = {
  LIVE: { label: "CONNECTED · DHAN LIVE", cls: "border-bull/40 bg-bull-muted text-bull" },
  CONNECTING: { label: "CONNECTING", cls: "border-warn/40 bg-warn-muted text-warn" },
  ERROR: { label: "ERROR · FAIL-CLOSED", cls: "border-bear/40 bg-bear-muted text-bear" },
  NOT_CONFIGURED: { label: "NOT CONFIGURED · SIMULATED", cls: "border-warn/40 bg-warn-muted text-warn" },
  SIMULATED: { label: "SIMULATED FEED", cls: "border-warn/40 bg-warn-muted text-warn" },
};

function ageClass(s: number) {
  if (s <= MAX_TICK_AGE_SECONDS / 2) return "text-bull";
  if (s <= MAX_TICK_AGE_SECONDS) return "text-warn";
  return "text-bear";
}

export function QuoteHealthPanel(p: Props) {
  const badge = connectionBadge[p.connection];
  const sinceSuccess = p.lastSuccessAt ? Math.round((p.nowMs - p.lastSuccessAt) / 1000) : null;
  return (
    <section className="panel mb-3 p-4" aria-label="Quote health">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Quote health</h2>
        <Badge variant="outline" className={badge.cls}>
          {badge.label}
        </Badge>
        {p.isFetching ? <span className="text-xs text-muted-foreground">refreshing…</span> : null}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={p.onReconnect} disabled={!p.canReconnect || p.isFetching}>
            {p.isFetching ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <RefreshCw className="mr-1 size-3.5" />}
            Reconnect
          </Button>
          <Button size="sm" variant="outline" onClick={p.onRescan}>
            Re-run scan
          </Button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Last good refresh</dt>
          <dd className="num">
            {p.lastSuccessAt ? `${formatTime(new Date(p.lastSuccessAt).toISOString())} · ${sinceSuccess}s ago` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last error</dt>
          <dd className="num">{p.lastErrorAt ? formatTime(new Date(p.lastErrorAt).toISOString()) : "none"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Consecutive failures</dt>
          <dd className={`num ${p.failureCount > 0 ? "text-bear" : ""}`}>{p.failureCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Scan age</dt>
          <dd className={`num ${p.scanAgeSeconds > p.scanStaleAfter ? "text-bear" : ""}`}>
            {p.scanAgeSeconds}s / {p.scanStaleAfter}s
          </dd>
        </div>
      </dl>

      {p.errorMessage ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-bear/40 bg-bear-muted p-2 text-xs text-bear">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>Refresh error: {p.errorMessage}</span>
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-2">Symbol</th>
              <th className="py-1 pr-2">Source</th>
              <th className="py-1 pr-2">Price</th>
              <th className="py-1 pr-2">Last update</th>
              <th className="py-1 pr-2">Age</th>
              <th className="py-1">Paper trading</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-3 text-center text-muted-foreground">
                  No candidates to monitor.
                </td>
              </tr>
            ) : (
              p.rows.map((r) => {
                const reasons = paperBlockReasons(r, p.scanAgeSeconds, p.scanStaleAfter);
                const age = r.verification.freshnessSeconds;
                return (
                  <tr key={r.symbol} className="border-t border-border align-top">
                    <td className="py-1.5 pr-2 font-medium">{r.symbol}</td>
                    <td className="py-1.5 pr-2">
                      {r.source === "DHAN_LIVE" ? (
                        <span className="text-bull">Dhan live</span>
                      ) : (
                        <span className="text-warn">Simulated</span>
                      )}
                    </td>
                    <td className="num py-1.5 pr-2">{formatPrice(r.price)}</td>
                    <td className="num py-1.5 pr-2">{formatTime(r.asOf)}</td>
                    <td className={`num py-1.5 pr-2 ${ageClass(age)}`}>{age}s</td>
                    <td className="py-1.5">
                      {reasons.length === 0 ? (
                        <span className="text-bull">Allowed (approval still required)</span>
                      ) : (
                        <ul className="space-y-0.5 text-bear">
                          {reasons.map((x) => (
                            <li key={x}>• {x}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
