import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_audit_log",
  title: "List audit log",
  description: "List recent audit log entries (approvals, blocks, scans, settings changes), newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).default(50).describe("How many entries to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const { data, error } = await supabaseForUser(ctx)
      .from("trade_audit")
      .select("id,at,action,severity,detail")
      .order("at", { ascending: false })
      .limit(limit);
    if (error) throw new ToolError("Could not read the audit log.");
    const entries = (data ?? []).map((e) => ({ id: e.id, at: e.at, action: e.action, severity: e.severity, detail: e.detail }));
    const text = entries.length
      ? entries.map((e) => `${e.at} [${e.severity}] ${e.action}: ${e.detail}`).join("\n")
      : "No audit entries (or this account is not the owner).";
    return { content: [{ type: "text", text }], structuredContent: { entries } };
  },
});
