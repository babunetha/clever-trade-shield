import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPaperTrades from "./tools/list-paper-trades";
import listAuditLog from "./tools/list-audit-log";
import getRiskLimits from "./tools/get-risk-limits";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "dhan-trading-buddy",
  title: "Dhan Trading Buddy",
  version: "0.1.0",
  instructions:
    "Read-only tools for the owner's risk-controlled paper-trading terminal: paper trades, audit log and hard risk limits. No tool can place orders; live trading is disabled.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listPaperTrades, listAuditLog, getRiskLimits],
});
