/** A received quote must have a valid timestamp and positive finite price. */
export const MAX_TICK_AGE_SECONDS = 20;

export function quoteHealth(price: number, asOf: string, now = Date.now()) {
  const timestamp = Date.parse(asOf);
  const elapsed = now - timestamp;
  const validTime = Number.isFinite(timestamp) && elapsed >= 0;
  const ageSeconds = validTime ? elapsed / 1000 : Number.POSITIVE_INFINITY;
  const fresh = Number.isFinite(price) && price > 0 && ageSeconds <= MAX_TICK_AGE_SECONDS;
  const reason =
    !Number.isFinite(price) || price <= 0
      ? "Price is missing or invalid. Refresh prices."
      : !validTime
        ? "Price timestamp is invalid or in the future. Refresh prices."
        : `Price is ${ageSeconds.toFixed(1)}s old (limit ${MAX_TICK_AGE_SECONDS}s). Refresh prices.`;
  return { fresh, ageSeconds, reason };
}
