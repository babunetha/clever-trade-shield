import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/trading/AppShell";
import { SignalCard } from "@/components/trading/SignalCard";
import { useTrading } from "@/lib/trading/store";
import { formatINR } from "@/lib/trading/format";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Trade Approval — ₹1L Trading Assistant" },
      {
        name: "description",
        content:
          "Manual approval queue: review each simulated setup against risk limits and confirm explicitly before it is logged.",
      },
      { property: "og:title", content: "Trade Approval — ₹1L Trading Assistant" },
      {
        property: "og:description",
        content: "Every simulated trade requires an explicit confirmation. Live broker execution stays disabled.",
      },
    ],
  }),
  component: Approvals,
});

function Approvals() {
  const { signals, risk, settings, trades } = useTrading();
  const pending = signals.filter((s) => s.status === "PENDING");
  const decided = signals.filter((s) => s.status === "APPROVED" || s.status === "REJECTED").slice(0, 6);

  return (
    <AppShell
      title="Trade Approval"
      subtitle="Two-step approval: read the verdict, then confirm. No order ever reaches a broker."
    >
      {risk.locked ? (
        <div className="panel mb-4 border-bear/40 bg-bear-muted p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-bear">
            <ShieldAlert className="size-4" /> Approvals are blocked
          </div>
          <ul className="mt-2 space-y-1 text-xs text-bear">
            {risk.lockReasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="panel mb-4 p-4 text-xs text-muted-foreground">
          Room left today: {risk.tradesLeft} of {settings.maxTradesPerDay} trades ·{" "}
          {formatINR(risk.lossBudgetLeft)} loss budget · {formatINR(settings.maxRiskPerTrade)} max risk per trade ·{" "}
          {trades.length} simulated trades logged in total.
        </div>
      )}

      <h2 className="text-sm font-semibold">Awaiting your decision ({pending.length})</h2>
      <div className="mt-3 space-y-3">
        {pending.map((s) => (
          <SignalCard key={s.id} signal={s} />
        ))}
        {!pending.length ? (
          <p className="panel p-4 text-sm text-muted-foreground">
            Nothing pending. Regenerate a simulated batch on the Signals screen.
          </p>
        ) : null}
      </div>

      <h2 className="mt-6 text-sm font-semibold">Recently decided</h2>
      <div className="mt-3 space-y-3">
        {decided.map((s) => (
          <SignalCard key={s.id} signal={s} showActions={false} />
        ))}
        {!decided.length ? (
          <p className="panel p-4 text-sm text-muted-foreground">No decisions recorded yet.</p>
        ) : null}
      </div>
    </AppShell>
  );
}
