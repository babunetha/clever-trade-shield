import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_paper_trades",
  title: "List paper trades",
  description: "List your recent simulated paper trades (no live orders exist), newest first.",
  inputSchema: {
    status: z.enum(["OPEN", "CLOSED", "ALL"]).default("ALL").describe("Filter by trade status."),
    limit: z.number().int().min(1).max(100).default(25).describe("How many trades to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    let q = supabaseForUser(ctx)
      .from("paper_trades")
      .select("payload")
      .order("opened_at", { ascending: false })
      .limit(limit);
    if (status !== "ALL") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw new ToolError("Could not read paper trades.");
    const pick = (p: unknown) => {
      const t = (p ?? {}) as Record<string, unknown>;
      const s = (k: string) => (typeof t[k] === "string" ? (t[k] as string) : null);
      const n = (k: string) => (typeof t[k] === "number" ? (t[k] as number) : null);
      return {
        id: s("id"), symbol: s("symbol"), side: s("side"), status: s("status"),
        entry: n("entry"), stopLoss: n("stopLoss"), quantity: n("quantity"),
        exit: n("exit"), pnl: n("pnl"), outcome: s("outcome"),
        openedAt: s("openedAt"), closedAt: s("closedAt"),
      };
    };
    const trades = (data ?? []).map((r) => pick(r.payload));
    const text = trades.length
      ? trades.map((t) => `${t.symbol} ${t.side} ${t.status} entry ${t.entry} pnl ${t.pnl ?? "-"}`).join("\n")
      : "No paper trades yet (or this account is not the owner).";
    return { content: [{ type: "text", text }], structuredContent: { trades } };
  },
});
