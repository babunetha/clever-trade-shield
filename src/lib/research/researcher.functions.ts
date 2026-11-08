import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth-middleware";
import { researchInput, ideaInput, mayHandoff, type ResearchRun } from "./engine";

export const listResearch = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("market_research_runs").select("payload").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(5);
  if (error) throw new Error("Saved research could not be loaded. Retry to reconnect.");
  return (data ?? []).map(r => r.payload as unknown as ResearchRun);
});

export const runResearch = createServerFn({ method: "POST" }).middleware([authMiddleware]).inputValidator((input: unknown) => researchInput.parse(input)).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { startResearch, researchBatch } = await import("./researcher.server");
  let run: ResearchRun;
  if (data.runId) {
    const row = await context.supabase.from("market_research_runs").select("payload").eq("id", data.runId).eq("user_id", context.userId).single();
    if (row.error) throw new Error("Research run not found.");
    run = row.data.payload as unknown as ResearchRun;
  } else {
    run = await startResearch();
  }
  // Optimistic claim protects concurrent tabs from overwriting a batch.
  const claimedAt = new Date().toISOString();
  if (data.runId) {
    const claim = await supabaseAdmin.from("market_research_runs").update({ updated_at: claimedAt }).eq("id", run.id).eq("user_id", context.userId).eq("updated_at", run.updatedAt).select("id");
    if (claim.error || !claim.data?.length) throw new Error("This batch changed in another tab. Refresh research before continuing.");
  } else {
    const save = await supabaseAdmin.from("market_research_runs").insert({ id: run.id, user_id: context.userId, updated_at: claimedAt, payload: JSON.parse(JSON.stringify(run)) });
    if (save.error) throw new Error("Could not save the research run.");
  }
  try {
    const next = await researchBatch(run);
    const save = await supabaseAdmin.from("market_research_runs").update({ payload: JSON.parse(JSON.stringify(next)), updated_at: next.updatedAt }).eq("id", run.id).eq("user_id", context.userId).eq("updated_at", claimedAt);
    if (save.error) throw new Error("Could not save research results.");
    return next;
  } catch (error) {
    await supabaseAdmin.from("market_research_runs").update({ updated_at: run.updatedAt }).eq("id", run.id).eq("updated_at", claimedAt);
    throw error;
  }
});

export const handoffResearch = createServerFn({ method: "POST" }).middleware([authMiddleware]).inputValidator((input: unknown) => ideaInput.parse(input)).handler(async ({ data, context }) => {
  const row = await context.supabase.from("market_research_runs").select("payload").eq("id", data.runId).eq("user_id", context.userId).single();
  if (row.error) throw new Error("Research run not found.");
  const run = row.data.payload as unknown as ResearchRun;
  const idea = run.ideas.find(i => i.symbol === data.symbol);
  if (!idea || !mayHandoff(idea)) throw new Error("Insufficient evidence: this idea cannot enter the watchlist.");
  idea.handedOffAt ??= new Date().toISOString();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const save = await supabaseAdmin.from("market_research_runs").update({ payload: JSON.parse(JSON.stringify(run)) }).eq("id", run.id).eq("user_id", context.userId).eq("updated_at", run.updatedAt).select("id");
  if (save.error || !save.data?.length) throw new Error("Research changed. Refresh before sending this idea.");
  return { ok: true };
});

export const researchInbox = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const rows = await context.supabase.from("market_research_runs").select("payload").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(5);
  if (rows.error) throw new Error("Could not read the research inbox.");
  const ideas = (rows.data ?? []).flatMap(r => (r.payload as unknown as ResearchRun).ideas).filter(i => i.handedOffAt && mayHandoff(i));
  return ideas.map(i => i.candidate).filter(c => c !== null);
});