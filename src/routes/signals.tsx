import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/trading/AppShell";
import { SignalCard } from "@/components/trading/SignalCard";
import { useTrading } from "@/lib/trading/store";
import { evaluateSignal, type Verdict } from "@/lib/trading/verdict";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/signals")({
  head: () => ({
    meta: [
      { title: "Signals — ₹1L Trading Assistant" },
      {
        name: "description",
        content:
          "Simulated intraday setups scored as BUY SETUP, WAIT or AVOID with entry, stop, targets, R:R, indicators and invalidation rules.",
      },
      { property: "og:title", content: "Signals — ₹1L Trading Assistant" },
      {
        property: "og:description",
        content: "BUY SETUP / WAIT / AVOID verdicts with EMA, RSI, MACD, VWAP, ADX, volume and index bias.",
      },
    ],
  }),
  component: Signals,
});

function Signals() {
  const { signals, settings, risk, refreshSignals } = useTrading();
  const [filter, setFilter] = useState<"ALL" | Verdict>("ALL");

  const rows = signals.map((s) => ({ signal: s, ...evaluateSignal(s, settings, risk) }));
  const visible = filter === "ALL" ? rows : rows.filter((r) => r.verdict === filter);

  return (
    <AppShell
      title="Signals"
      subtitle="Simulated setups with a plain-language verdict. Nothing is executed from this screen."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as "ALL" | Verdict)}>
          <TabsList>
            <TabsTrigger value="ALL">All ({rows.length})</TabsTrigger>
            <TabsTrigger value="BUY SETUP">
              BUY SETUP ({rows.filter((r) => r.verdict === "BUY SETUP").length})
            </TabsTrigger>
            <TabsTrigger value="WAIT">WAIT ({rows.filter((r) => r.verdict === "WAIT").length})</TabsTrigger>
            <TabsTrigger value="AVOID">AVOID ({rows.filter((r) => r.verdict === "AVOID").length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => {
            refreshSignals();
            toast.success("Fresh simulated signal batch generated");
          }}
        >
          <RefreshCw className="mr-1 size-3.5" /> Regenerate simulated batch
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {visible.map((r) => (
          <SignalCard key={r.signal.id} signal={r.signal} />
        ))}
        {!visible.length ? (
          <p className="panel p-4 text-sm text-muted-foreground">No signals in this bucket right now.</p>
        ) : null}
      </div>
    </AppShell>
  );
}
