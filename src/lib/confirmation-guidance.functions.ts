import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { authMiddleware } from "./auth-middleware";
import {
  confirmationInput,
  mayResumeGuidance,
  sanitizeConfirmationError,
} from "./confirmation-guidance";

export const getConfirmationGuidance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: unknown) => confirmationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: saved, error: readError } = await context.supabase
      .from("confirmation_ai_pause")
      .select("status,message,provider_denial")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readError)
      return {
        guidance: null,
        error: "Could not check AI availability. Please try again later.",
        paused: false,
        canResume: false,
      };
    if (!mayResumeGuidance(saved, data.resume)) {
      return {
        guidance: null,
        error: saved?.message ?? "AI guidance is paused.",
        paused: true,
        canResume: !saved?.provider_denial,
      };
    }
    const { data: account, error: accountError } = await context.supabase.auth.getUser();
    if (accountError || !account.user)
      return {
        guidance: null,
        error: "Could not verify your sign-in. Sign in normally and try again.",
        paused: false,
        canResume: false,
      };
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey)
      return {
        guidance: null,
        error: "AI guidance is not configured. Email verification remains unchanged.",
        paused: false,
        canResume: false,
      };
    const { explainConfirmation, safeGatewayError } =
      await import("./confirmation-ai/guidance.server");
    try {
      const guidance = await explainConfirmation(
        getRequest(),
        apiKey,
        { status: data.status, errorMessage: sanitizeConfirmationError(data.errorMessage) },
        Boolean(account.user.email_confirmed_at),
      );
      if (saved) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("confirmation_ai_pause").delete().eq("user_id", context.userId);
      }
      return { guidance, error: null, paused: false, canResume: false };
    } catch (error) {
      const failure = safeGatewayError(error);
      setResponseStatus(failure.status);
      if (failure.status === 402 || failure.status === 403) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: saveError } = await supabaseAdmin
          .from("confirmation_ai_pause")
          .upsert({ user_id: context.userId, ...failure });
        if (saveError)
          throw new Error(
            "AI guidance stopped, but its paused state could not be saved. Please do not resend.",
          );
      }
      return {
        guidance: null,
        error: failure.message,
        paused: failure.status === 402 || failure.status === 403,
        canResume: (failure.status === 402 || failure.status === 403) && !failure.provider_denial,
      };
    }
  });
