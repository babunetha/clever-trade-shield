import { createServerFn } from "@tanstack/react-start";

/** Returns broker wiring status as booleans only — no secrets cross the wire. */
export const getDhanStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { readDhanCredentialStatus } = await import("./dhan.server");
  return readDhanCredentialStatus();
});

/** Authenticated connection test against GET /v2/profile. Client id is masked. */
export const testDhanConnection = createServerFn({ method: "POST" }).handler(async () => {
  const { testDhanConnection: run } = await import("./dhan.server");
  return run();
});

/** Read-only account snapshot: funds + holdings + positions in one round trip. */
export const getDhanAccount = createServerFn({ method: "POST" }).handler(async () => {
  const { getDhanFunds, getDhanHoldings, getDhanPositions } = await import("./dhan.server");
  const [funds, holdings, positions] = await Promise.all([getDhanFunds(), getDhanHoldings(), getDhanPositions()]);
  return { funds, holdings, positions };
});

/** Live LTP for a small list of NSE cash security ids (Data API subscription required). */
export const getDhanQuotes = createServerFn({ method: "POST" })
  .inputValidator((input: { securityIds: string[] }) => ({
    securityIds: (Array.isArray(input?.securityIds) ? input.securityIds : [])
      .map((id) => String(id).trim())
      .filter((id) => /^\d{1,8}$/.test(id))
      .slice(0, 25),
  }))
  .handler(async ({ data }) => {
    const { getDhanLtp } = await import("./dhan.server");
    return getDhanLtp(data.securityIds);
  });

/** Always refuses in v1; kept so the UI can prove the kill-switch works. */
export const submitApprovedTrade = createServerFn({ method: "POST" })
  .inputValidator((input: { signalId: string }) => input)
  .handler(async ({ data }) => {
    const { placeDhanOrder } = await import("./dhan.server");
    const result = await placeDhanOrder({
      symbol: data.signalId,
      side: "BUY",
      quantity: 0,
      price: 0,
      stopLoss: 0,
      productType: "INTRADAY",
    });
    return result;
  });
