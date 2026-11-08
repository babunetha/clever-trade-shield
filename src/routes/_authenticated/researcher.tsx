import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Microscope, Play, RefreshCw, ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/trading/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listResearch, runResearch, handoffResearch } from "@/lib/research/researcher.functions";
import { analyzeCandidateEvidence } from "@/lib/ai-analysis.functions";
import { mayHandoff } from "@/lib/research/engine";

const researchQuery = queryOptions({
  queryKey: ["market-research"],
  queryFn: () => listResearch(),
  retry: false,
});
export const Route = createFileRoute("/_authenticated/researcher")({
  loader: ({ context }) => context.queryClient.ensureQueryData(researchQuery),
  head: () => ({
    meta: [
      { title: "AI Market Researcher — Clever Trade Shield" },
      {
        name: "description",
        content:
          "Dhan equity research, sourced evidence, data quality, historical validation and a manually verified CTS watchlist.",
      },
      { property: "og:title", content: "AI Market Researcher — Clever Trade Shield" },
      {
        property: "og:description",
        content:
          "Research Indian cash equities with saved Dhan evidence and fail-closed manual trade confirmation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Researcher,
});

function Researcher() {
  const { data: runs } = useSuspenseQuery(researchQuery);
  const cache = useQueryClient();
  const execute = useServerFn(runResearch);
  const send = useServerFn(handoffResearch);
  const analyze = useServerFn(analyzeCandidateEvidence);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, string>>({});
  const [aiBusy, setAiBusy] = useState(false);
  const run = runs[0];
  const idea = run?.ideas.find((i) => i.symbol === selected) ?? run?.ideas[0];
  async function scan(resume: boolean) {
    setBusy(true);
    setError(null);
    try {
      await execute({ data: resume && run ? { runId: run.id } : {} });
      await cache.invalidateQueries({ queryKey: ["market-research"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research could not complete.");
    } finally {
      setBusy(false);
    }
  }
  async function handoff() {
    if (!run || !idea) return;
    setBusy(true);
    try {
      await send({ data: { runId: run.id, symbol: idea.symbol } });
      await cache.invalidateQueries({ queryKey: ["market-research"] });
      toast.success("Sent to CTS research watchlist. Verification still required.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Handoff failed.");
    } finally {
      setBusy(false);
    }
  }
  async function explain() {
    if (!idea) return;
    setAiBusy(true);
    try {
      const result = await analyze({
        data: {
          symbol: idea.symbol,
          name: idea.symbol,
          indicators: Object.fromEntries(idea.evidence.map((e) => [e.field, e.value])),
          newsContext: "",
          verdict: idea.verdict,
          plan: idea.trigger,
        },
      });
      if (!result.ok) throw new Error(result.error);
      setAnalysis((a) => ({ ...a, [idea.symbol]: result.analysis }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI unavailable.");
    } finally {
      setAiBusy(false);
    }
  }
  return (
    <AppShell title="AI Market Researcher">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Microscope className="size-5 text-primary" />
          <Badge variant="outline">DHAN · NSE CASH EQUITIES</Badge>
          <Badge variant="secondary">RESEARCH ONLY</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => scan(false)}>
            <Play className="mr-2 size-4" />
            New research run
          </Button>
          {run && run.status !== "COMPLETE" && (
            <Button disabled={busy} onClick={() => scan(true)}>
              <RefreshCw className={`mr-2 size-4 ${busy ? "animate-spin" : ""}`} />
              {busy ? "Researching…" : "Continue batch"}
            </Button>
          )}
        </div>
      </div>
      {(error || run?.error) && (
        <div
          role="alert"
          className="mb-4 flex gap-3 border border-destructive bg-destructive/10 p-4 text-sm"
        >
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          {error || run?.error}
        </div>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["NSE instruments", run?.universe.length ?? "—"],
          ["Evaluated", run?.cursor ?? 0],
          [
            "Quality passed",
            run?.ideas.filter((i) => i.data_quality.status === "PASS").length ?? 0,
          ],
          ["Watchlist ideas", run?.ideas.filter(mayHandoff).length ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-border py-3">
            <div className="label-caps">{label}</div>
            <div className="num mt-2 text-2xl">{value}</div>
          </div>
        ))}
      </div>
      <Tabs defaultValue="research">
        <TabsList>
          <TabsTrigger value="research">Research desk</TabsTrigger>
          <TabsTrigger value="sources">Sources & briefing</TabsTrigger>
          <TabsTrigger value="runs">Saved runs</TabsTrigger>
        </TabsList>
        <TabsContent value="research">
          {!run ? (
            <div className="py-16 text-center text-muted-foreground">
              <Microscope className="mx-auto mb-4 size-10" />
              <h2 className="text-lg text-foreground">No research runs yet</h2>
              <p className="mt-2 text-sm">Dhan data: NOT_AVAILABLE</p>
            </div>
          ) : (
            <>
              <div className="my-4 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {run.status} · {run.cursor}/{run.universe.length} evaluated ·{" "}
                  {run.ideas.filter((i) => i.data_quality.status === "FAIL").length} excluded
                </span>
                <span>
                  {new Date(run.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{" "}
                  IST
                </span>
              </div>
              <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
                <div className="space-y-2">
                  {run.ideas.map((i) => (
                    <Button
                      key={i.symbol}
                      variant={idea?.symbol === i.symbol ? "secondary" : "outline"}
                      className="h-auto w-full justify-between py-3"
                      onClick={() => setSelected(i.symbol)}
                    >
                      <span>{i.symbol}</span>
                      <Badge variant={i.data_quality.status === "FAIL" ? "destructive" : "outline"}>
                        {i.verdict.replace("_", " ")}
                      </Badge>
                    </Button>
                  ))}
                  {!run.ideas.length && (
                    <p className="text-sm text-muted-foreground">
                      No symbols evaluated.{" "}
                      {run.error ? "Data access blocked." : "Continue the research batch."}
                    </p>
                  )}
                </div>
                {idea && (
                  <section className="min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                      <div>
                        <h2 className="text-xl font-semibold">{idea.symbol}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {idea.strategy.id} · v{idea.strategy.version}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {idea.verdict === "NO_TRADE"
                          ? "NO TRADE — INSUFFICIENT CONFIRMATION"
                          : "WAIT — INTRADAY CONFIRMATION"}
                      </Badge>
                    </div>
                    <p className="my-3 text-sm text-muted-foreground">{idea.invalidation}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-border text-muted-foreground">
                          <tr>
                            <th className="py-2">Evidence</th>
                            <th>Value</th>
                            <th>Source / time (UTC)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {idea.evidence.map((e) => (
                            <tr key={e.field} className="border-b border-border">
                              <td className="py-2 pr-3">{e.field}</td>
                              <td className="num pr-3">{e.value ?? "NOT_AVAILABLE"}</td>
                              <td className="text-muted-foreground">
                                {e.status === "OK" ? `Dhan · ${e.source_ts}` : "NOT_AVAILABLE"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div>
                        <h3 className="text-sm font-semibold">
                          Historical validation · daily strategy
                        </h3>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {idea.backtest
                            ? `${idea.backtest.trades} trades · ${idea.backtest.winRate}% wins · ${idea.backtest.expectancyR}R net expectancy`
                            : "NOT_AVAILABLE"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {idea.walkForward
                            ? `${idea.walkForward.windows.length} OOS windows · ${idea.walkForward.outOfSample.expectancyR}R OOS expectancy`
                            : "NOT_AVAILABLE"}
                        </p>
                        <p className="mt-1 text-xs text-warn">
                          Daily-history validation is not an intraday execution backtest.
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">Entry confirmation</h3>
                        <p className="mt-2 text-xs text-muted-foreground">{idea.trigger}</p>
                      </div>
                    </div>
                    <div className="my-5 flex flex-wrap gap-2">
                      <Button
                        disabled={busy || !mayHandoff(idea) || Boolean(idea.handedOffAt)}
                        onClick={handoff}
                      >
                        <ArrowRight className="mr-2 size-4" />
                        {idea.handedOffAt ? "Sent to CTS" : "Send to CTS watchlist"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={aiBusy || idea.data_quality.status !== "PASS"}
                        onClick={explain}
                      >
                        {aiBusy ? "Reviewing evidence…" : "AI evidence review"}
                      </Button>
                      <Button variant="ghost" asChild>
                        <Link to="/scanner">Open CTS Scanner</Link>
                      </Button>
                    </div>
                    {analysis[idea.symbol] && (
                      <div className="border-t border-border pt-4 text-sm whitespace-pre-wrap">
                        {analysis[idea.symbol]}
                      </div>
                    )}
                  </section>
                )}
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="sources">
          <div className="divide-y divide-border">
            {[
              ["Dhan instrument master", "Available on research request"],
              [
                "Daily OHLCV",
                run?.error ??
                  (run?.ideas.some((i) => i.data_quality.status === "PASS")
                    ? "Dhan evidence saved"
                    : "NOT_AVAILABLE"),
              ],
              ["Live quotes & intraday", "Independent CTS confirmation required"],
              ["Morning briefing · 08:30 IST", "NOT_SCHEDULED"],
              ["India VIX, breadth, flows & global macro", "NOT_AVAILABLE — source not connected"],
              ["Official news & fundamentals", "NOT_AVAILABLE — source not connected"],
              ["Advanced structure & volume profile", "NOT_AVAILABLE — not implemented"],
            ].map(([name, status]) => (
              <div key={name} className="flex flex-wrap justify-between gap-3 py-4 text-sm">
                <span>{name}</span>
                <span className="text-muted-foreground">{status}</span>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="runs">
          <div className="divide-y divide-border">
            {runs.map((r) => (
              <div key={r.id} className="flex flex-wrap justify-between gap-2 py-4 text-sm">
                <span>{new Date(r.createdAt).toLocaleString("en-IN")}</span>
                <span>
                  {r.status} · {r.cursor}/{r.universe.length} · {r.ideas.filter(mayHandoff).length}{" "}
                  ideas
                </span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
