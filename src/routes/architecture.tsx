import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  Bot,
  BrainCircuit,
  Database,
  FileSearch,
  GitBranch,
  LockKeyhole,
  Newspaper,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { AppShell } from "@/components/trading/AppShell";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/architecture")({
  head: () => ({
    meta: [
      { title: "System Architecture — Clever Trade Shield" },
      {
        name: "description",
        content: "Clever Trade Shield market data, AI research, risk and execution architecture.",
      },
    ],
  }),
  component: ArchitecturePage,
});

const research = [
  { title: "Technical Analyst", icon: TrendingUp, detail: "Technical market structure and indicators" },
  { title: "News Analyst", icon: Newspaper, detail: "News and event research" },
  { title: "Fundamental Analyst", icon: FileSearch, detail: "Fundamental company research" },
  { title: "Sentiment Analyst", icon: BrainCircuit, detail: "Market and sentiment research" },
];

const downstream = [
  { title: "Bull / Bear Debate", icon: Scale, detail: "Structured opposing-case research" },
  { title: "Research Manager", icon: GitBranch, detail: "Combines and organizes analyst research" },
  { title: "Trader", icon: Bot, detail: "Turns research into a proposed trade" },
  { title: "Risk Management", icon: ShieldCheck, detail: "Applies trading risk constraints" },
  { title: "Portfolio Manager", icon: WalletCards, detail: "Checks portfolio-level impact" },
  { title: "RISK ENGINE", icon: LockKeyhole, detail: "Final deterministic risk gate" },
  { title: "Semi-Automatic Approval", icon: ShoppingCart, detail: "Human approval before execution" },
  { title: "DHAN API", icon: Database, detail: "Broker integration layer" },
  { title: "Order Execution", icon: Sparkles, detail: "Final order execution boundary" },
];

function ArchitecturePage() {
  return (
    <AppShell
      title="System Architecture"
      subtitle="The first build target: a clear separation between market data, AI research, decision-making, risk and execution."
    >
      <section className="panel overflow-hidden p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label-caps">CLEVER TRADE SHIELD</div>
            <h2 className="mt-1 text-lg font-semibold">Trading System Flow</h2>
          </div>
          <Badge variant="outline" className="num">
            ARCHITECTURE · PHASE 1
          </Badge>
        </div>

        <div className="mx-auto max-w-5xl">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 text-center">
            <div className="text-xl font-bold tracking-wide">CLEVER TRADE SHIELD</div>
            <div className="mt-1 text-xs text-muted-foreground">Central trading system</div>
          </div>

          <div className="grid gap-4 pt-4 lg:grid-cols-[1fr_1.5fr]">
            <FlowBranch
              title="MARKET DATA ENGINE"
              icon={Database}
              detail="Real-time and historical market data"
              badge="DHAN"
            />

            <section className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <BrainCircuit className="size-5 text-primary" />
                <div>
                  <div className="font-semibold">AI RESEARCH</div>
                  <div className="text-xs text-muted-foreground">Independent research agents</div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {research.map(({ title, icon: Icon, detail }) => (
                  <div key={title} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="size-4 text-primary" />
                      {title}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <ArrowDown className="mx-auto my-3 size-5 text-muted-foreground" />

          <div className="rounded-xl border border-border p-4">
            <div className="grid gap-2">
              {downstream.map(({ title, icon: Icon, detail }, index) => (
                <div key={title}>
                  <div
                    className={
                      title === "RISK ENGINE"
                        ? "rounded-lg border border-primary/50 bg-primary/10 p-3"
                        : "rounded-lg border border-border bg-background p-3"
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="size-4 text-primary" />
                      <span className="text-sm font-semibold">{title}</span>
                      <span className="text-[11px] text-muted-foreground">— {detail}</span>
                    </div>
                  </div>
                  {index < downstream.length - 1 ? (
                    <ArrowDown className="mx-auto my-1.5 size-4 text-muted-foreground" />
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3 text-xs">
              <div className="label-caps">Market-data path</div>
              <div className="mt-1">DHAN → Market Data Engine → system decision flow</div>
            </div>
            <div className="rounded-lg border border-border p-3 text-xs">
              <div className="label-caps">Execution path</div>
              <div className="mt-1">Risk Engine → Semi-Automatic Approval → DHAN API → Order Execution</div>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function FlowBranch({
  title,
  icon: Icon,
  detail,
  badge,
}: {
  title: string;
  icon: typeof Database;
  detail: string;
  badge: string;
}) {
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-primary" />
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
      </div>
      <Badge variant="outline" className="mt-4 num">
        {badge}
      </Badge>
    </section>
  );
}
