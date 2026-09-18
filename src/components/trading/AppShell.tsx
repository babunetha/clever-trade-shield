import { Link } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  CheckSquare,
  LayoutDashboard,
  LineChart,
  Radar,
  Radio,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTrading } from "@/lib/trading/store";
import { formatPct, formatSignedINR, formatPrice, tone } from "@/lib/trading/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/market", label: "Market Overview", icon: LineChart },
  { to: "/scanner", label: "Scanner", icon: Radar },
  { to: "/signals", label: "Signals", icon: Radio },
  { to: "/approvals", label: "Trade Approval", icon: CheckSquare },
  { to: "/journal", label: "Trade Journal", icon: BookOpen },
  { to: "/risk", label: "Risk Controls", icon: ShieldCheck },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { indices, quotes, risk, settings, setTradingEnabled } = useTrading();

  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-warn-muted px-4 py-1.5 text-center text-[11px] tracking-wide text-warn">
        SIMULATED DATA · NO LIVE ORDERS · Live execution is disabled by feature flag. Educational use only — not
        investment advice.
      </div>

      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Activity className="size-4" />
            </span>
            <span className="text-sm font-semibold">₹1L Trading Assistant</span>
          </Link>

          <div className="flex flex-wrap items-center gap-3 num text-xs">
            {indices.map((i) => (
              <span key={i.symbol} className="flex items-center gap-1.5">
                <span className="label-caps">{i.symbol}</span>
                <span>{formatPrice(i.ltp)}</span>
                <span className={tone(i.change)}>{formatPct(i.changePct)}</span>
              </span>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Badge variant={risk.locked ? "destructive" : "secondary"} className="num">
              {risk.locked ? "RISK LOCK" : "ARMED"}
            </Badge>
            <span className={`num text-xs ${tone(risk.realisedPnl)}`}>{formatSignedINR(risk.realisedPnl)}</span>
            <Button
              size="sm"
              variant={settings.tradingEnabled ? "outline" : "destructive"}
              onClick={() => setTradingEnabled(!settings.tradingEnabled)}
            >
              <ShieldAlert className="mr-1 size-3.5" />
              {settings.tradingEnabled ? "Disable trading" : "Trading disabled"}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden border-t border-border">
          <div className="flex w-max gap-6 whitespace-nowrap px-4 py-1 num text-[11px] ticker-tape">
            {[...quotes, ...quotes].map((q, i) => (
              <span key={`${q.symbol}-${i}`} className="text-muted-foreground">
                {q.symbol} <span className="text-foreground">{formatPrice(q.ltp)}</span>{" "}
                <span className={tone(q.change)}>{formatPct(q.changePct)}</span>
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="flex">
        <nav className="hidden w-56 shrink-0 border-r border-border bg-sidebar p-3 md:block">
          <ul className="space-y-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                  activeOptions={{ exact: to === "/" }}
                  activeProps={{ className: "bg-sidebar-accent text-sidebar-primary font-medium" }}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 px-4 py-5">
          <div className="mb-5">
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {children}
        </main>
      </div>

      <nav className="sticky bottom-0 z-30 flex overflow-x-auto border-t border-border bg-background/95 px-2 py-1 backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-1 min-w-16 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground"
            activeOptions={{ exact: to === "/" }}
            activeProps={{ className: "text-primary" }}
          >
            <Icon className="size-4" />
            {label.split(" ")[0]}
          </Link>
        ))}
      </nav>

      <footer className="border-t border-border px-4 py-6 text-xs text-muted-foreground">
        Simulated market data for education and workflow testing. This dashboard never places live orders; broker
        integration stays server-side behind a disabled flag. Trading in Indian equities carries risk of capital loss.
      </footer>
    </div>
  );
}
