import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Brain, Loader2 } from "lucide-react";
import { AppShell } from "@/components/trading/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runAiTradingAgents } from "@/lib/ai-agents.functions";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "AI Agents — ₹1L Trading Assistant" },
      { name: "description", content: "Bull, Bear, Risk and Final Validator agents powered by Gemini." },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const runAgents = useServerFn(runAiTradingAgents);
  const [symbol, setSymbol] = useState("RELIANCE");
  const [result, setResult] = useState<Awaited<ReturnType<typeof runAiTradingAgents>> | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setResult(null);
    const response = await runAgents({
      data: {
        symbol: symbol.trim().toUpperCase(),
        name: symbol.trim().toUpperCase(),
        price: 0,
        entry: 0,
        stopLoss: 0,
        target1: 0,
        riskReward: 0,
      },
    });
    setResult(response);
    setLoading(false);
  }

  return (
    <AppShell title="AI Agents" subtitle="Bull + Bear + Risk + Final Validator. Server-side Gemini key; no key is exposed to the browser.">
      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Brain className="size-5" />
          <input
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="NSE symbol"
          />
          <Button onClick={() => void run()} disabled={loading || !symbol.trim()}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Run Gemini agents
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          This page is the integration test. The scanner will be wired to send real Dhan candidate metrics next.
        </p>
      </div>

      {result && !result.ok ? (
        <div className="mt-4 rounded-md border border-bear/40 bg-bear-muted p-4 text-sm text-bear">
          <AlertTriangle className="mr-2 inline size-4" />
          {result.error}
        </div>
      ) : null}

      {result?.ok ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ["Bull", result.result.bull],
            ["Bear", result.result.bear],
            ["Risk", result.result.risk],
            ["Final Validator", result.result.validator],
          ].map(([name, agent]) => (
            <section key={name} className="panel p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{name}</h2>
                <Badge variant="outline">{agent.decision} · {agent.confidence}%</Badge>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {agent.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
              </ul>
              {agent.risks.length ? (
                <div className="mt-3 text-xs text-bear">Risks: {agent.risks.join(" · ")}</div>
              ) : null}
              <p className="mt-3 text-xs">{agent.notes}</p>
            </section>
          ))}
        </div>
      ) : null}
    </AppShell>
  );
}
