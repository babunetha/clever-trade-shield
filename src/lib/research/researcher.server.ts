import { loadDhanInstruments } from "@/lib/market/instruments";
import { getDhanDailyHistoricalCandles } from "@/lib/dhan.server";
import { buildResearchIdea, type ResearchRun } from "./engine";

export async function startResearch(): Promise<ResearchRun> {
  const instruments = await loadDhanInstruments();
  const seen = new Set<string>();
  const universe = instruments.filter(i => i.exchangeSegment === "NSE_EQ" && i.instrument === "EQUITY" && /^\d{1,8}$/.test(i.securityId) && !seen.has(i.tradingSymbol) && Boolean(seen.add(i.tradingSymbol)))
    .map(({ securityId, tradingSymbol, customSymbol }) => ({ securityId, tradingSymbol, customSymbol }))
    .sort((a, b) => a.tradingSymbol.localeCompare(b.tradingSymbol));
  if (!universe.length) throw new Error("Dhan returned no eligible NSE equity instruments.");
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, universe, cursor: 0, ideas: [], status: "RUNNING", error: null };
}

/** Small explicit resumable batches; never silently drop failed symbols. */
export async function researchBatch(run: ResearchRun): Promise<ResearchRun> {
  const next = { ...run, ideas: [...run.ideas], status: "RUNNING" as ResearchRun["status"], error: null as string | null };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  for (const ins of run.universe.slice(run.cursor, run.cursor + 3)) {
    const result = await getDhanDailyHistoricalCandles({ securityId: ins.securityId, exchangeSegment: "NSE_EQ", instrument: "EQUITY", fromDate: new Date(Date.now() - 520 * 86400000).toISOString().slice(0, 10), toDate: today });
    if (!result.ok && ["NOT_CONFIGURED", "UNAUTHORIZED", "DATA_NOT_SUBSCRIBED", "RATE_LIMITED"].includes(result.code)) {
      next.status = "BLOCKED"; next.error = result.error; break;
    }
    next.ideas.push(buildResearchIdea(ins, result.ok ? result.data : [], new Date().toISOString(), result.ok ? undefined : result.error));
    next.cursor++;
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  if (next.cursor >= next.universe.length) next.status = "COMPLETE";
  next.updatedAt = new Date().toISOString();
  return next;
}