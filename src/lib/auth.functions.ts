import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Server-verified access check for the signed-in account (owner role required). */
export const getAccessStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (error || typeof data !== "boolean")
      throw new Error("Could not verify terminal access. Please retry.");
    return { authenticated: true as const, owner: data };
  });
