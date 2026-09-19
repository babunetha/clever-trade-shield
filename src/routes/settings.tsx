import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Clock3, Lock, RefreshCw, Server } from "lucide-react";
import { AppShell } from "@/components/trading/AppShell";
import { DEFAULT_SETTINGS, useTrading } from "@/lib/trading/store";
import { testDhanConnection, getDhanStatus } from "@/lib/dhan.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Clever Trade Shield" },
      { name: "description", content: "Risk controls, Dhan read-only connection status and disabled live execution." },
      { property: "og:title", content: "Settings — Clever Trade Shield" },
      { property: "og:description", content: "Professional risk controls with server-side Dhan market-data integration." },
    ],
  }),
  component: SettingsPage,
});

const NUMERIC = [
  { key: "capital", label: "Starting capital (₹)", step: 1000 },
  { key: "maxRiskPerTrade", label: "Max risk per trade (₹)", step: 50 },
  { key: "maxDailyLoss", label: "Max daily loss (₹)", step: 100 },
  { key: "maxTradesPerDay", label: "Max trades per day", step: 1 },
  { key: "lockAfterLosingTrades", label: "Lock after N losing trades", step: 1 },
  { key: "minRiskReward", label: "Minimum reward-to-risk", step: 0.1 },
] as const;

type DhanUiState =
  | { kind: "loading" }
  | {
      kind: "ready";
      clientIdConfigured: boolean;
      accessTokenConfigured: boolean;
      mode: "SIMULATION" | "LIVE_READ_ONLY";
      liveExecutionEnabled: false;
      checkedAt?: string;
      profile?: { dhanClientIdMasked: string; tokenValidity: string | null; activeSegments: string | null };
      error?: string;
    };

function SettingsPage() {
  const { settings, saveSettings, setTradingEnabled } = useTrading();
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(NUMERIC.map((n) => [n.key, String(settings[n.key])])),
  );
  const [session, setSession] = useState({ start: settings.sessionStart, end: settings.sessionEnd });
  const [dhan, setDhan] = useState<DhanUiState>({ kind: "loading" });
  const [testing, setTesting] = useState(false);

  const refreshDhanStatus = async () => {
    try {
      const status = await getDhanStatus();
      setDhan({ kind: "ready", ...status });
    } catch {
      setDhan({
        kind: "ready",
        clientIdConfigured: false,
        accessTokenConfigured: false,
        mode: "SIMULATION",
        liveExecutionEnabled: false,
        error: "Could not read server configuration status.",
      });
    }
  };

  useEffect(() => {
    void refreshDhanStatus();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const result = await testDhanConnection();
      if (result.ok) {
        setDhan((prev) => ({
          ...prev,
          kind: "ready",
          checkedAt: new Date().toISOString(),
          profile: result.data,
          error: undefined,
        }));
        toast.success("Dhan connection verified — read-only mode");
      } else {
        setDhan((prev) => ({
          ...prev,
          kind: "ready",
          checkedAt: new Date().toISOString(),
          profile: undefined,
          error: result.error,
        }));
        toast.error(result.error);
      }
    } catch {
      toast.error("Connection test failed unexpectedly");
      await refreshDhanStatus();
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    const patch: Record<string, number> = {};
    for (const n of NUMERIC) {
      const value = Number(draft[n.key]);
      if (!Number.isFinite(value) || value <= 0) {
        toast.error(`${n.label} must be a positive number`);
        return;
      }
      patch[n.key] = value;
    }
    if ((patch["maxRiskPerTrade"] ?? 0) > (patch["maxDailyLoss"] ?? 0)) {
      toast.error("Risk per trade cannot exceed the daily loss cap");
      return;
    }
    if ((patch["capital"] ?? 0) < (patch["maxDailyLoss"] ?? 0)) {
      toast.error("Daily loss cap cannot exceed capital");
      return;
    }
    saveSettings({ ...patch, sessionStart: session.start, sessionEnd: session.end } as never);
    toast.success("Risk settings saved");
  };

  const connectionReady = dhan.kind === "ready" && dhan.clientIdConfigured && dhan.accessTokenConfigured;
  const verified = Boolean(dhan.kind === "ready" && dhan.profile);
  const tokenValidity = dhan.kind === "ready" ? dhan.profile?.tokenValidity : null;

  return (
    <AppShell title="Settings" subtitle="Risk controls, broker connectivity and execution safeguards.">
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="text-sm font-semibold">Risk parameters</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {NUMERIC.map((n) => (
              <div key={n.key} className="space-y-1">
                <Label htmlFor={n.key} className="text-xs">{n.label}</Label>
                <Input id={n.key} className="num" inputMode="decimal" step={n.step} value={draft[n.key] ?? ""} onChange={(e) => setDraft((p) => ({ ...p, [n.key]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="start" className="text-xs">Session start</Label>
              <Input id="start" type="time" className="num" value={session.start} onChange={(e) => setSession((p) => ({ ...p, start: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end" className="text-xs">Session end</Label>
              <Input id="end" type="time" className="num" value={session.end} onChange={(e) => setSession((p) => ({ ...p, end: e.target.value }))} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={save}>Save settings</Button>
            <Button size="sm" variant="outline" onClick={() => {
              setDraft(Object.fromEntries(NUMERIC.map((n) => [n.key, String(DEFAULT_SETTINGS[n.key])])));
              setSession({ start: DEFAULT_SETTINGS.sessionStart, end: DEFAULT_SETTINGS.sessionEnd });
              toast.info("Reverted to the default ₹1L profile — press Save to apply");
            }}>Restore ₹1L defaults</Button>
          </div>
        </section>

        <div className="space-y-3">
          <section className="panel p-4">
            <h2 className="text-sm font-semibold">Guardrails</h2>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-sm">Trading enabled</div><p className="text-xs text-muted-foreground">Emergency switch — blocks every approval instantly.</p></div>
                <Switch checked={settings.tradingEnabled} onCheckedChange={setTradingEnabled} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-sm">Equity intraday only</div><p className="text-xs text-muted-foreground">F&O and options are off by design in this version.</p></div>
                <Switch checked disabled />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-sm">Live order execution</div><p className="text-xs text-muted-foreground">Hard-disabled. No order endpoint is called by this build.</p></div>
                <Badge variant="destructive" className="num"><Lock className="mr-1 size-3" /> DISABLED</Badge>
              </div>
            </div>
          </section>

          <DhanConnection />

        </div>
      </div>
    </AppShell>
  );
}
