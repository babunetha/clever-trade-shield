import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

function url() {
  const v = process.env["SUPABASE_URL"];
  if (!v) throw new Error("Backend is not configured.");
  return v;
}
function key() {
  const v = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!v) throw new Error("Backend is not configured.");
  return v;
}

export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("supabaseForUser requires a verified OAuth token");
  const k = key();
  return createClient<Database>(url(), k, {
    global: {
      headers: { Authorization: `Bearer ${token}`, apikey: k },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
