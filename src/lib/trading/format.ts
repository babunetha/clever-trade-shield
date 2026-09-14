const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const inr0 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const num2 = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export const formatINR = (value: number) => inr.format(value);
export const formatINR0 = (value: number) => inr0.format(value);
export const formatPrice = (value: number) => num2.format(value);
export const formatCompact = (value: number) => compact.format(value);

export const formatSignedINR = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "-" : ""}${inr.format(Math.abs(value))}`;

export const formatPct = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "-" : ""}${num2.format(Math.abs(value))}%`;

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const tone = (value: number) =>
  value > 0 ? "text-bull" : value < 0 ? "text-bear" : "text-muted-foreground";
