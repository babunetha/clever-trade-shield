import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Radar, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/trading/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { SCANNERS, defaultScannerConfig, type ScannerConfig, type ScannerId } from "@/lib/scanner/definitions";
import { runScanners, type ScanCandidate } from "@/lib/scanner/candidates";
import { MAX_TICK_AGE_SECONDS, stateClasses, verifyCandidate, type VerificationResult } from "@/lib/scanner/verify";
import { SECTORS } from "@/lib/scanner/series";
import { useTrading } from "@/lib/trading/store";
import { formatDateTime, formatINR, formatPrice, formatTime } from "@/lib/trading/format";
import { getDhanStatus } from "@/lib/dhan.functions";
import { getScannerLiveQuotes } from "@/lib/scanner.functions";
import { runAiTradingAgents } from "@/lib/ai-agents.functions";\nimport { runDhanLiveScan } from "@/lib/live-scan.functions";

export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "Scanner — ₹1L Trading Assistant" },
      {
        name: "description",
        content:
          "Five configurable scanner concepts run over simulated daily history, then verified independently before any paper trade is allowed.",
      },
      { property: "og:title", content: "Scanner — ₹1L Trading Assistant" },
      {
        property: "og:description",
        content: "Candidate discovery with second-stage verification, risk caps and manual approval. No live orders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScannerPage,
});

/** Candidates older than this are shown as stale and cannot be paper traded. */
const STALE_AFTER_SECONDS = 120;

interface Row {
  candidate: ScanCandidate;
  verification: VerificationResult;
}

function ScannerPage() {
  const { quotes, indices, settings, risk, trades, openPaperTrade } = useTrading();
  const [config, setConfig] = useState<ScannerConfig>(() => defaultScannerConfig());
  const [candidates, setCandidates] = useState<ScanCandidate[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);\n  const [scanSource, setScanSource] = useState<"SIMULATED" | "DHAN_LIVE">("SIMULATED");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, Awaited<ReturnType<typeof runAiTradingAgents>>>>({});

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);

  const runScan = useCallback(() => {
    setStatus("loading");
    setError(null);
    window.setTimeout(() => {
      try {
        const found = runScanners(config, Math.floor(Math.random() * 1e9));
        setCandidates(found);
        setScanSource("SIMULATED");
        setScannedAt(new Date().toISOString());
        setNowMs(Date.now());
        setStatus("ready");
      } catch (e) {
        setCandidates(null);
        setError(e instanceof Error ? e.message : "The scan could not be completed.");
        setStatus("error");
      }
    }, 30);
  }, [config]);

  const runLiveScan = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const result = await runDhanLiveScan({ data: { config } });
      if (!result.ok) throw new Error(result.error);
      setCandidates(result.candidates);
      setScanSource("DHAN_LIVE");
      setScannedAt(new Date().toISOString());
      setNowMs(Date.now());
      setStatus("ready");
      toast.success("Dhan live research scan complete.");
    } catch (e) {
      setCandidates(null);
      setError(e instanceof Error ? e.message : "Dhan live scan failed.");
      setStatus("error");
      toast.error(e instanceof Error ? e.message : "Dhan live scan failed.");
    }
  }, [config]);

  // Client-only first scan (the engine is heavy and must not run during SSR).
  useEffect(() => {
    runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanAgeSeconds = scannedAt ? Math.max(0, Math.round((nowMs - new Date(scannedAt).getTime()) / 1000)) : 0;
  const stale = Boolean(scannedAt) && scanAgeSeconds > STALE_AFTER_SECONDS;
  const openPositions = trades.filter((t) => t.status === "OPEN").length;
  const niftyBias = indices[0]?.bias ?? "NEUTRAL";

  const symbols = useMemo(
    () => Array.from(new Set((candidates ?? []).map((c) => c.symbol))).sort(),
    [candidates],
  );

  const dhanStatus = useQuery({ queryKey: ["dhan-status"], queryFn: () => getDhanStatus(), staleTime: 60_000 });
  const brokerConfigured = Boolean(
    dhanStatus.data?.clientIdConfigured && dhanStatus.data?.accessTokenConfigured,
  );

  const fetchLive = useServerFn(getScannerLiveQuotes);
  const live = useQuery({
    queryKey: ["scanner-live-quotes", symbols.join(",")],
    queryFn: () => fetchLive({ data: { symbols } }),
    enabled: brokerConfigured && symbols.length > 0,
    // Only the candidate symbols are subscribed, and only while this screen is open.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: 2,
    gcTime: 30_000,
  });

  const liveResult = live.data;
  const liveOk = Boolean(liveResult?.ok);
  const liveMap = useMemo(() => {
    const map = new Map<string, number>();
    if (liveResult?.ok) for (const q of liveResult.quotes) map.set(q.symbol, q.price);
    return map;
  }, [liveResult]);
  const liveError = live.isError
    ? "The live price request failed. Reconnect to retry."
    : liveResult && !liveResult.ok
      ? liveResult.error
      : null;

  const rows = useMemo<Row[]>(() => {
    if (!candidates) return [];
    const asOf = new Date(Date.now() - scanAgeSeconds * 1000).toISOString();
    return [...candidates].sort((a, b) => b.research.score - a.research.score).map((candidate) => {
      const quote = quotes.find((q) => q.symbol === candidate.symbol);
      const sector = SECTORS[candidate.symbol] ?? "Unclassified";
      const peers = quotes.filter((q) => (SECTORS[q.symbol] ?? "Unclassified") === sector);
      const sectorChangePct = peers.length ? peers.reduce((s, q) => s + q.changePct, 0) / peers.length : 0;
      const livePrice = liveMap.get(candidate.symbol.toUpperCase());
      const tick =
        liveOk && livePrice !== undefined && liveResult?.ok
          ? { price: livePrice, asOf: liveResult.asOf, source: "DHAN_LIVE" as const }
          : { price: quote?.ltp ?? candidate.scanClose, asOf, source: "SIMULATED" as const };
      return {
        candidate,
        verification: verifyCandidate({
          candidate,
          tick,
          niftyBias,
          sectorChangePct,
          settings,
          risk,
          openPositions,
        }),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, quotes, niftyBias, settings, risk, openPositions, scanAgeSeconds, liveMap, liveOk, liveResult]);

  const counts = {
    buy: rows.filter((r) => r.verification.state === "BUY CANDIDATE").length,
    wait: rows.filter((r) => r.verification.state === "WAIT").length,
    avoid: rows.filter((r) => r.verification.state === "AVOID").length,
  };

  const setCriterion = (id: ScannerId, key: string, value: number) =>
    setConfig((prev) => ({ ...prev, [id]: { ...prev[id], criteria: { ...prev[id].criteria, [key]: value } } }));

  const runAiValidation = async (row: Row) => {
    setAiLoading(row.candidate.symbol);
    try {
      const v = row.verification;
      const response = await runAiTradingAgents({
        data: {
          symbol: row.candidate.symbol,
          name: row.candidate.name,
          price: v.plan.entry,
          scanClose: row.candidate.scanClose,
          rsi14: v.metrics.rsi14,
          atr14: v.metrics.atr14,
          rvol: v.metrics.rvol,
          pctOf52wHigh: v.metrics.pctOf52wHigh,
          tradedValueCr: v.metrics.tradedValueCr,
          niftyBias,
          sectorChangePct: 0,
          entry: v.plan.entry,
          stopLoss: v.plan.stopLoss,
          target1: v.plan.target1,
          target2: v.plan.target2,
          riskReward: v.plan.riskReward,
          research: row.candidate.research,
        },
      });
      setAiResults((prev) => ({ ...prev, [row.candidate.symbol]: response }));
      if (!response.ok) toast.error(response.error);
      else toast.success(`Gemini validation complete for ${row.candidate.symbol}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI validation failed.");
    } finally {
      setAiLoading(null);
    }
  };

  const takePaperTrade = (row: Row) => {
    if (stale) {
      toast.error("These results are stale. Re-run the scan first.");
      return;
    }
    if (row.verification.state !== "BUY CANDIDATE") {
      toast.error("Verification has not passed for this candidate.");
      return;
    }
    const res = openPaperTrade({
      symbol: row.candidate.symbol,
      name: row.candidate.name,
      entry: row.verification.plan.entry,
      stopLoss: row.verification.plan.stopLoss,
      target1: row.verification.plan.target1,
      quantity: row.verification.plan.quantity,
      riskRupees: row.verification.plan.riskRupees,
      source: row.candidate.scannerName,
    });
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  };

  return (
    <AppShell
      title="Scanner"
      subtitle="Five scanner concepts as candidate sources only. Every candidate is re-verified here before it can become a paper trade."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {liveOk ? (
          <Badge className="bg-success text-success-foreground">LIVE DHAN PRICES · READ-ONLY</Badge>
        ) : (
          <Badge variant="outline" className="border-warn/40 bg-warn-muted text-warn">
            SIMULATED / MOCK PRICES
          </Badge>
        )}
        <Badge variant="outline" className="border-border">
          Scanner history: simulated
        </Badge>
        <Badge variant="destructive">LIVE ORDERS OFF</Badge>
        {liveOk && liveResult?.ok ? (
          <span className="num text-xs text-muted-foreground">
            Prices {formatTime(liveResult.asOf)}
            {live.isFetching ? " · refreshing" : ""}
          </span>
        ) : null}
        {scannedAt ? (
          <span className="num text-xs text-muted-foreground">
            Scanned {formatTime(scannedAt)} · {scanAgeSeconds}s ago
          </span>
        ) : null}
        {stale ? (
          <Badge variant="outline" className="border-bear/40 bg-bear-muted text-bear">
            <AlertTriangle className="mr-1 size-3" /> STALE — RE-RUN
          </Badge>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => void live.refetch()}
          disabled={!brokerConfigured || live.isFetching}
        >
          {live.isFetching ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <RefreshCw className="mr-1 size-3.5" />}
          Reconnect prices
        </Button>
        <Button size="sm" variant="outline" onClick={runScan} disabled={status === "loading"}>
          {status === "loading" ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <RefreshCw className="mr-1 size-3.5" />}
          Re-run scan
        </Button>
      </div>

      {!brokerConfigured && !dhanStatus.isLoading ? (
        <div className="mb-3 rounded-md border border-warn/40 bg-warn-muted p-3 text-xs text-warn">
          Live Dhan prices are off because the broker credentials are not configured on the server. Add
          <span className="num"> DHAN_CLIENT_ID </span> and <span className="num">DHAN_ACCESS_TOKEN</span> as backend
          secrets (Settings → Dhan connection). Until then every price here is simulated and paper trading is judged on
          simulated prices only.
        </div>
      ) : null}

      {brokerConfigured && liveError ? (
        <div className="mb-3 rounded-md border border-bear/40 bg-bear-muted p-3 text-xs text-bear">
          {liveError} Verification falls back to simulated prices, and a stale price blocks paper trading by design.
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[22rem_1fr]">
        <section className="panel p-4">
          <h2 className="text-sm font-semibold">Scanners &amp; criteria</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Thresholds are yours to tune. No accuracy claim from any public scanner is reproduced here.
          </p>
          <div className="mt-3 space-y-4">
            {SCANNERS.map((def) => (
              <div key={def.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{def.name}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{def.summary}</p>
                  </div>
                  <Switch
                    checked={config[def.id].enabled}
                    onCheckedChange={(enabled) =>
                      setConfig((prev) => ({ ...prev, [def.id]: { ...prev[def.id], enabled } }))
                    }
                  />
                </div>
                <p className="mt-2 text-[11px] text-warn">{def.caveat}</p>
                {config[def.id].enabled ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {def.criteria.map((c) => (
                      <div key={c.key} className="space-y-1">
                        <Label htmlFor={`${def.id}-${c.key}`} className="text-[11px]">
                          {c.label} ({c.unit})
                        </Label>
                        <Input
                          id={`${def.id}-${c.key}`}
                          className="num h-8"
                          inputMode="decimal"
                          value={String(config[def.id].criteria[c.key] ?? c.value)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) setCriterion(def.id, c.key, v);
                          }}
                        />
                        <p className="text-[10px] text-muted-foreground">{c.hint}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={runScan} disabled={status === "loading"}>
              Apply &amp; scan
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConfig(defaultScannerConfig());
                toast.info("Criteria reset to defaults — press Apply & scan");
              }}
            >
              Reset criteria
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <div className="panel flex flex-wrap items-center gap-4 p-3 num text-xs">
            <span>
              <span className="label-caps mr-2">Candidates</span>
              {rows.length}
            </span>
            <span className="text-bull">BUY CANDIDATE {counts.buy}</span>
            <span className="text-warn">WAIT {counts.wait}</span>
            <span className="text-bear">AVOID {counts.avoid}</span>
            <span className="ml-auto text-muted-foreground">
              Index bias {niftyBias} · open positions {openPositions}/{settings.maxOpenPositions} · trades left{" "}
              {risk.tradesLeft}
            </span>
          </div>

          {status === "loading" ? (
            <div className="panel flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Running the enabled scanners…
            </div>
          ) : null}

          {status === "error" ? (
            <div className="panel p-6 text-sm">
              <div className="flex items-center gap-2 text-bear">
                <AlertTriangle className="size-4" /> The scan failed
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              <Button size="sm" className="mt-3" onClick={runScan}>
                Try again
              </Button>
            </div>
          ) : null}

          {status === "ready" && rows.length === 0 ? (
            <div className="panel p-8 text-center text-sm text-muted-foreground">
              <Radar className="mx-auto mb-2 size-5" />
              No symbol met the enabled criteria in this simulated scan. Loosen a threshold or re-run.
            </div>
          ) : null}

          {status === "ready" && stale ? (
            <div className="panel border-bear/40 p-3 text-xs text-bear">
              These results were produced {scanAgeSeconds}s ago and are no longer treated as current. Paper trading is
              blocked until you re-run the scan.
            </div>
          ) : null}

          {status === "ready"
            ? rows.map((row) => {
                const { candidate: cand, verification: v } = row;
                const open = selected === cand.id;
                const canTrade = v.state === "BUY CANDIDATE" && !stale && !risk.locked;
                return (
                  <article key={cand.id} className="panel p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-40">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{cand.symbol}</span>
                          <Badge variant="outline" className={stateClasses[v.state]}>
                            {v.state}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{cand.name}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {v.sector} · {cand.scannerName}
                        </div>
                      </div>

                      <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 num text-xs sm:grid-cols-4">
                        <Metric label={liveOk && liveMap.has(cand.symbol.toUpperCase()) ? "Price (Dhan live)" : "Price (sim)"} value={formatPrice(v.plan.entry)} />
                        <Metric label="Scan close" value={formatPrice(cand.scanClose)} />
                        <Metric label="52w proximity" value={`${v.metrics.pctOf52wHigh}%`} />
                        <Metric label="Liquidity" value={`₹${v.metrics.tradedValueCr} Cr`} />
                        <Metric label="RVOL" value={v.metrics.rvol !== null ? `${v.metrics.rvol}x` : "—"} />
                        <Metric label="RSI 14" value={v.metrics.rsi14 ?? "—"} />
                        <Metric label="ATR 14" value={v.metrics.atr14 ?? "—"} />
                        <Metric label="Checks" value={`${v.passed}/${v.total}`} />
                        <Metric label="Research score" value={`${cand.research.score}/100`} />
                      </div>

                      <div className="num text-right text-xs">
                        <div>
                          Entry <span className="text-foreground">{formatPrice(v.plan.entry)}</span>
                        </div>
                        <div className="text-bear">Stop {formatPrice(v.plan.stopLoss)}</div>
                        <div className="text-bull">
                          T1 {formatPrice(v.plan.target1)} · T2 {formatPrice(v.plan.target2)}
                        </div>
                        <div className="text-muted-foreground">
                          {v.plan.quantity} sh · risk {formatINR(v.plan.riskRupees)} · R:R {v.plan.riskReward}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-md border border-border bg-muted/20 p-3 text-xs">\n                      <div className="flex flex-wrap gap-x-4 gap-y-1 num">\n                        <span>Backtest {cand.research.trades} trades</span>\n                        <span>Win {cand.research.winRate}%</span>\n                        <span>Expectancy {cand.research.expectancyR}R</span>\n                        <span>PF {cand.research.profitFactor}</span>\n                        <span>Max DD {cand.research.maxDrawdownR}R</span>\n                      </div>\n                      <div className="mt-1 text-[11px] text-muted-foreground">Historical simulation only; used for ranking, not future-return prediction.</div>\n                    </div>\n\n                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSelected(open ? null : cand.id)}>

                        {open ? "Hide checks" : `Why ${v.state}`}
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" disabled={!canTrade}>
                            Approve paper trade
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Log a simulated paper trade?</AlertDialogTitle>
                            <AlertDialogDescription>
                              LONG {v.plan.quantity} {cand.symbol} at {formatPrice(v.plan.entry)}, stop{" "}
                              {formatPrice(v.plan.stopLoss)}, target {formatPrice(v.plan.target1)}, risk{" "}
                              {formatINR(v.plan.riskRupees)}. This is recorded in the journal on simulated data only — no
                              order is sent to any broker and live execution stays disabled.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => takePaperTrade(row)}>
                              Approve simulated trade
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void runAiValidation(row)}
                        disabled={aiLoading === cand.symbol}
                      >
                        {aiLoading === cand.symbol ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                        Gemini validate
                      </Button>

                      <span className="num text-[11px] text-muted-foreground">
                        Price age {v.freshnessSeconds}s (limit {MAX_TICK_AGE_SECONDS}s) · found{" "}
                        {formatDateTime(cand.scannedAt)}
                      </span>
                    </div>

                    {aiResults[cand.symbol]?.ok ? (
                      <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">Gemini multi-agent validation</span>
                          <Badge variant="outline">
                            {aiResults[cand.symbol].result.finalDecision} · {aiResults[cand.symbol].result.confidence}%
                          </Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-xs md:grid-cols-4">
                          <div><span className="label-caps">Bull</span> {aiResults[cand.symbol].result.bull.decision}</div>
                          <div><span className="label-caps">Bear</span> {aiResults[cand.symbol].result.bear.decision}</div>
                          <div><span className="label-caps">Risk</span> {aiResults[cand.symbol].result.risk.decision}</div>
                          <div><span className="label-caps">Validator</span> {aiResults[cand.symbol].result.validator.decision}</div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {aiResults[cand.symbol].result.validator.notes}
                        </p>
                      </div>
                    ) : null}

                    {open ? (
                      <div className="mt-3 grid gap-3 border-t border-border pt-3 md:grid-cols-2">
                        <div>
                          <div className="label-caps mb-1">Scanner match</div>
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            {cand.matched.map((m) => (
                              <li key={m}>· {m}</li>
                            ))}
                          </ul>
                          <div className="label-caps mt-3 mb-1">Invalidation</div>
                          <p className="text-xs text-muted-foreground">
                            A close below {formatPrice(v.plan.stopLoss)} invalidates the setup. It is also void if the
                            price loses the last completed daily close, the index bias turns bearish, or the scan goes
                            stale.
                          </p>
                        </div>
                        <div>
                          <div className="label-caps mb-1">Verification checks</div>
                          <ul className="space-y-1 text-xs">
                            {v.checks.map((c) => (
                              <li key={c.label} className={c.ok ? "text-muted-foreground" : c.blocking ? "text-bear" : "text-warn"}>
                                {c.ok ? "PASS" : c.blocking ? "FAIL (blocking)" : "FAIL"} · {c.label} — {c.detail}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            : null}
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="label-caps">{label}</div>
      <div>{value}</div>
    </div>
  );
}
