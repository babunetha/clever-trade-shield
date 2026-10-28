import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";
import type { AgentMarketSnapshot } from "./ai-agents.server";
import { z } from "zod";

export const runAiTradingAgents = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: AgentMarketSnapshot) =>
    z
      .object({
        symbol: z
          .string()
          .trim()
          .regex(/^[A-Z0-9&.-]{1,30}$/),
        name: z.string().max(100).optional(),
        price: z.number().finite().positive(),
        scanClose: z.number().finite().positive().optional(),
        rsi14: z.number().finite().nullable().optional(),
        atr14: z.number().finite().nullable().optional(),
        rvol: z.number().finite().nullable().optional(),
        pctOf52wHigh: z.number().finite().nullable().optional(),
        tradedValueCr: z.number().finite().nullable().optional(),
        niftyBias: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]).optional(),
        sectorChangePct: z.number().finite().optional(),
        entry: z.number().finite().positive(),
        stopLoss: z.number().finite().positive(),
        target1: z.number().finite().positive(),
        target2: z.number().finite().positive().optional(),
        riskReward: z.number().finite().nonnegative(),
        research: z
          .object({
            score: z.number().finite(),
            trades: z.number().int().nonnegative(),
            winRate: z.number().finite(),
            expectancyR: z.number().finite(),
            profitFactor: z.number().finite(),
            maxDrawdownR: z.number().finite(),
            totalR: z.number().finite(),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { runTradingAgents } = await import("./ai-agents.server");
      return { ok: true as const, result: await runTradingAgents(data) };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error && error.message.includes("not configured")
            ? "Gemini is not configured on the server."
            : "AI committee unavailable. Check server configuration and retry.",
      };
    }
  });
