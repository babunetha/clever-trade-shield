import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";
import { runTradingAgents, type AgentMarketSnapshot } from "./ai-agents.server";

export const runAiTradingAgents = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: AgentMarketSnapshot) => input)
  .handler(async ({ data }) => {
    try {
      return { ok: true as const, result: await runTradingAgents(data) };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "AI agent analysis failed.",
      };
    }
  });
