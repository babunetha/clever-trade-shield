export const ORDER_STATUSES = ["PENDING","SUBMITTING","SUBMITTED","PARTIALLY_FILLED","FILLED","REJECTED","CANCELLED","EXPIRED","UNKNOWN","RECONCILING"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
const terminal = new Set<OrderStatus>(["FILLED","REJECTED","CANCELLED","EXPIRED"]);
const allowedTransitions: Record<OrderStatus, ReadonlySet<OrderStatus>> = {
  PENDING: new Set(["SUBMITTING","RECONCILING","REJECTED"]),
  SUBMITTING: new Set(["SUBMITTED","UNKNOWN","REJECTED","RECONCILING"]),
  SUBMITTED: new Set(["PARTIALLY_FILLED","FILLED","REJECTED","CANCELLED","EXPIRED","UNKNOWN","RECONCILING"]),
  PARTIALLY_FILLED: new Set(["PARTIALLY_FILLED","FILLED","CANCELLED","EXPIRED","UNKNOWN","RECONCILING"]),
  FILLED: new Set(["FILLED"]), REJECTED: new Set(["REJECTED"]), CANCELLED: new Set(["CANCELLED"]), EXPIRED: new Set(["EXPIRED"]),
  UNKNOWN: new Set(["RECONCILING","SUBMITTED","PARTIALLY_FILLED","FILLED","REJECTED","CANCELLED","EXPIRED"]),
  RECONCILING: new Set(["RECONCILING","SUBMITTED","PARTIALLY_FILLED","FILLED","REJECTED","CANCELLED","EXPIRED","UNKNOWN"]),
};
export function isTerminalOrderStatus(status: string): status is OrderStatus { return terminal.has(status as OrderStatus); }
export function transitionOrderStatus(current: string, next: OrderStatus): OrderStatus {
  if (current === next) return next;
  if (!ORDER_STATUSES.includes(current as OrderStatus)) return next;
  if (allowedTransitions[current as OrderStatus].has(next)) return next;
  if (isTerminalOrderStatus(current)) return current as OrderStatus;
  throw new Error(`Invalid order state transition: ${current} -> ${next}`);
}
