import { createServerFn } from "@tanstack/react-start";

/** Returns broker wiring status as booleans only — no secrets cross the wire. */
export const getDhanStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { readDhanCredentialStatus } = await import("./dhan.server");
  return readDhanCredentialStatus();
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
