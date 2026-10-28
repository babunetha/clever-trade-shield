import { createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Every private server function runs through this middleware:
 * 1. the signed-in account's token is re-validated server-side, and
 * 2. the account must hold the server-side "owner" role (first account only).
 */
export const authMiddleware = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (error || data !== true) throw new Error("Forbidden: this account has no terminal access.");
    setResponseHeader("Cache-Control", "private, no-store");
    return next();
  });
