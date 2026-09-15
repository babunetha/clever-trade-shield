import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { AppShell } from "@/components/trading/AppShell";
import { DEFAULT_SETTINGS, useTrading } from "@/lib/trading/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ₹1L Trading Assistant" },
      {
        name: "description",
        content:
          "Tune capital, per-trade risk, daily loss cap, trade count and session window. Live broker execution stays disabled.",
      },
      { property: "og:title", content: "Settings — ₹1L Trading Assistant" },
      {
        property: "og:description",
        content: "Risk parameters and the server-side-only broker integration placeholder.",
      },
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

function SettingsPage() {
  const { settings, saveSettings, setTradingEnabled } = useTrading();
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(NUMERIC.map((n) => [n.key, String(settings[n.key])])),
  );
  const [session, setSession] = useState({ start: settings.sessionStart, end: settings.sessionEnd });

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

  return (
    <AppShell title="Settings" subtitle="Risk parameters, session window and the disabled live-execution flag.">
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="text-sm font-semibold">Risk parameters</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {NUMERIC.map((n) => (
              <div key={n.key} className="space-y-1">
                <Label htmlFor={n.key} className="text-xs">
                  {n.label}
                </Label>
                <Input
                  id={n.key}
                  className="num"
                  inputMode="decimal"
                  step={n.step}
                  value={draft[n.key] ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, [n.key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="start" className="text-xs">
                Session start
              </Label>
              <Input
                id="start"
                type="time"
                className="num"
                value={session.start}
                onChange={(e) => setSession((p) => ({ ...p, start: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end" className="text-xs">
                Session end
              </Label>
              <Input
                id="end"
                type="time"
                className="num"
                value={session.end}
                onChange={(e) => setSession((p) => ({ ...p, end: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={save}>
              Save settings
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(Object.fromEntries(NUMERIC.map((n) => [n.key, String(DEFAULT_SETTINGS[n.key])])));
                setSession({ start: DEFAULT_SETTINGS.sessionStart, end: DEFAULT_SETTINGS.sessionEnd });
                toast.info("Reverted to the default ₹1L profile — press Save to apply");
              }}
            >
              Restore ₹1L defaults
            </Button>
          </div>
        </section>

        <div className="space-y-3">
          <section className="panel p-4">
            <h2 className="text-sm font-semibold">Guardrails</h2>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm">Trading enabled</div>
                  <p className="text-xs text-muted-foreground">Emergency switch — blocks every approval instantly.</p>
                </div>
                <Switch checked={settings.tradingEnabled} onCheckedChange={setTradingEnabled} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm">Equity intraday only</div>
                  <p className="text-xs text-muted-foreground">F&O and options are off by design in this version.</p>
                </div>
                <Switch checked disabled />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm">Live order execution</div>
                  <p className="text-xs text-muted-foreground">
                    Hard-disabled feature flag. This build can never place a real order.
                  </p>
                </div>
                <Badge variant="destructive" className="num">
                  <Lock className="mr-1 size-3" /> DISABLED
                </Badge>
              </div>
            </div>
          </section>

          <section className="panel p-4">
            <h2 className="text-sm font-semibold">Broker integration (Dhan)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The integration lives entirely on the server: an authorisation callback placeholder and a typed order
              interface that currently refuses every request. No credentials, keys, tokens, PINs or OTPs are requested,
              stored or displayed anywhere in this app — and none should ever be typed into chat.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li>· Connection status: not connected (simulated data only)</li>
              <li>· Callback endpoint: reserved, returns a safe placeholder response</li>
              <li>· Order placement: blocked by the disabled live-execution flag</li>
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
