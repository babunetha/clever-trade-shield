import { defineTool } from "@lovable.dev/mcp-js";

const limits = {
  capitalInr: 100000,
  maxRiskPerTradeInr: 500,
  maxDailyLossInr: 1000,
  maxWeeklyLossInr: 2500,
  maxTradesPerDay: 3,
  maxOpenPositions: 2,
  lockAfterLosses: 2,
  segment: "Equity intraday only",
  fnoEnabled: false,
  liveOrdersEnabled: false,
};

export default defineTool({
  name: "get_risk_limits",
  title: "Get risk limits",
  description: "Return the hard safety limits this terminal enforces. Live orders are always disabled.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [{ type: "text", text: Object.entries(limits).map(([k, v]) => `${k}: ${v}`).join("\n") }],
    structuredContent: { limits },
  }),
});
