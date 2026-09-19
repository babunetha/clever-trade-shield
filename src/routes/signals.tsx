import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Radio } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/trading/AppShell";
import { SignalCard } from "@/components/trading/SignalCard";
import { useTrading } from "@/lib/trading/store";
import { getDhanLiveSignals } from "@/lib/live-signals.functions";
import { evaluateSignal, type Verdict } from "@/lib/trading/verdict";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/signals")({
  head: () => ({
    meta: [
      { title: "Signals — Clever Trade Shield" },
      { name: "description", content: "Dhan-derived technical signals with risk-aware manual approval and simulated execution." },
    ],
  }),
  component: Signals,
});

function Signals() {
  const { signals, settings, risk, refreshSignals, publishLiveSignals } = useTrading();
  const [filter, setFilter] = useState<"ALL" | Verdict>("ALL");
  const [loading, setLoading] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [lastLiveAt, setLastLiveAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLive = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDhanLiveSignals({
        data: {
          symbols: ["RELIANCE", "HDFCBANK", "INFY", "SBIN", "ICICIBANK", "TATAMOTORS"],
          maxRiskPerTrade: settings.maxRiskPerTrade,
        },
      });
      if (!result.ok) {
        setError(result.error);
        setLiveMode(false);
        return;
      }
      publishLiveSignals(result.data.signals);
      setLiveMode(true);
      setLastLiveAt(result.data.asOf);
      toast.success(`${result.data.signals.length} Dhan-derived signal(s) loaded`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Live signal request failed");
      setLiveMode(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLive();
    // One initial live scan only. Re-run manually to control API usage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = signals.map((s) => ({ signal: s, ...evaluateSignal(s, settings, risk) }));
  const visible = filter === "ALL" ? rows : rows.filter((r) => r.verdict === filter);

  return (
    <AppShell
      title="Signals"
      subtitle={liveMode ? "Dhan-derived 5-minute technical signals · manual approval · paper execution only" : "Simulated signal mode · no broker feed connected"}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={liveMode ? "default" : "outline"}>
          <Radio className="mr-1 size-3" /> {liveMode ? "DHAN LIVE ANALYSIS" : "SIMULATED ANALYSIS"}
        </Badge>
        {lastLiveAt ? <span className="num text-xs text-muted-foreground">Updated {new Date(lastLiveAt).toLocaleTimeString()}</span> : null}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as "ALL" | Verdict)}>
          <TabsList>
            <TabsTrigger value="ALL">All ({rows.length})</TabsTrigger>
            <TabsTrigger value="BUY SETUP">BUY SETUP ({rows.filter((r) => r.verdict === "BUY SETUP").length})</TabsTrigger>
            <TabsTrigger value="WAIT">WAIT ({rows.filter((r) => r.verdict === "WAIT").length})</TabsTrigger>
            <TabsTrigger value="AVOID">AVOID ({rows.filter((r) => r.verdict === "AVOID").length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void loadLive()} disabled={loading}>
            <RefreshCw className={`mr-1 size-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Scanning Dhan…" : "Scan Dhan"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => {
            refreshSignals();
            setLiveMode(false);
            toast.success("Fresh simulated signal batch generated");
          }}>
            Simulate
          </Button>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-lg border border-warn/40 bg-warn-muted p-3 text-xs text-warn">{error}</div> : null}

      <div className="mt-4 space-y-3">
        {visible.map((r) => <SignalCard key={r.signal.id} signal={r.signal} />)}
        {!visible.length ? <p className="panel p-4 text-sm text-muted-foreground">No signals in this bucket right now.</p> : null}
      </div>
    </AppShell>
  );
}
