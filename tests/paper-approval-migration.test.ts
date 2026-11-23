import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const databaseUrl = process.env.CTS_TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

databaseDescribe("server paper-approval migration", () => {
  let db: ReturnType<typeof postgres>;

  beforeAll(async () => {
    db = postgres(databaseUrl!, { max: 1 });
    await db.unsafe(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'service_role') then
          create role service_role;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated;
        end if;
      end
      $$;
    `);
    await db.unsafe(
      readFileSync(
        "supabase/migrations/20261120170000_server_authoritative_paper_approval.sql",
        "utf8",
      ),
    );
  });

  afterAll(async () => {
    await db?.end();
  });

  test("creates the approval RPC and restricts it to the backend role", async () => {
    const [privileges] = await db<
      {
        anon_can_execute: boolean;
        authenticated_can_execute: boolean;
        service_can_execute: boolean;
      }[]
    >`select
      has_function_privilege('anon', 'public.approve_paper_trade(text,text,timestamptz,jsonb)', 'execute') as anon_can_execute,
      has_function_privilege('authenticated', 'public.approve_paper_trade(text,text,timestamptz,jsonb)', 'execute') as authenticated_can_execute,
      has_function_privilege('service_role', 'public.approve_paper_trade(text,text,timestamptz,jsonb)', 'execute') as service_can_execute`;

    expect(privileges).toEqual({
      anon_can_execute: false,
      authenticated_can_execute: false,
      service_can_execute: true,
    });
  });

  test("rejects a missing approval identifier", async () => {
    const [row] = await db<{ result: { ok: boolean; reason: string } }[]>`
      select public.approve_paper_trade('', 'SIMULATED', null, '{}'::jsonb) as result
    `;

    expect(row.result).toEqual({ ok: false, reason: "Invalid or missing approval identifier." });
  });

  test("rejects an unrecognized trade source", async () => {
    const [row] = await db<{ result: { ok: boolean; reason: string } }[]>`
      select public.approve_paper_trade('test-source', 'UNKNOWN', null, '{}'::jsonb) as result
    `;

    expect(row.result).toEqual({ ok: false, reason: "Unknown paper-trade data source." });
  });

  test("recalculates risk and rejects risk above the server cap", async () => {
    const [row] = await db<{ result: { ok: boolean; reason: string } }[]>`
      select public.approve_paper_trade(
        'test-risk-cap',
        'SIMULATED',
        null,
        '{"symbol":"TEST","entry":100,"stopLoss":99,"target1":102,"quantity":501,"side":"LONG"}'::jsonb
      ) as result
    `;

    expect(row.result).toEqual({
      ok: false,
      reason: "Per-trade risk exceeds the ₹500 server cap.",
    });
  });

  test("recalculates reward-to-risk and rejects below 1.5R", async () => {
    const [row] = await db<{ result: { ok: boolean; reason: string } }[]>`
      select public.approve_paper_trade(
        'test-minimum-rr',
        'SIMULATED',
        null,
        '{"symbol":"TEST","entry":100,"stopLoss":99,"target1":101.49,"quantity":100,"side":"LONG"}'::jsonb
      ) as result
    `;

    expect(row.result).toEqual({
      ok: false,
      reason: "Server-calculated reward/risk is below 1.5R.",
    });
  });
});
