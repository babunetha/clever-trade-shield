import { z } from "zod";

export const confirmationInput = z
  .object({
    status: z.enum(["not_confirmed", "email_missing", "link_expired", "confirmed", "unknown"]),
    errorMessage: z.string().trim().max(1200),
    resume: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (/\b(password|access[_ -]?token|refresh[_ -]?token|authorization|api[_ -]?key)\s*[:=]\s*\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|\bsk-[A-Za-z0-9_-]+/i.test(value.errorMessage)) {
      ctx.addIssue({ code: "custom", message: "Remove passwords, tokens and API keys before requesting guidance." });
    }
  });

export function sanitizeConfirmationError(message: string) {
  return message
    .replace(/https?:\/\/[^\s]+/gi, "[link removed]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]");
}

export function mayResumeGuidance(pause: { provider_denial: boolean } | null, requested: boolean) {
  return !pause || (requested && !pause.provider_denial);
}