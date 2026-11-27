/** Parse Dhan's DD/MM/YYYY HH:mm:ss market timestamp as Asia/Kolkata time. */
export function parseDhanLastTradeTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const local = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (local) {
    const [, dayText, monthText, yearText, hourText, minuteText, secondText] = local;
    const day = Number(dayText),
      month = Number(monthText),
      year = Number(yearText);
    const hour = Number(hourText),
      minute = Number(minuteText),
      second = Number(secondText);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59)
      return null;
    const localDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (
      localDate.getUTCFullYear() !== year ||
      localDate.getUTCMonth() !== month - 1 ||
      localDate.getUTCDate() !== day
    )
      return null;
    const utc = localDate.getTime() - (5 * 60 + 30) * 60_000;
    return new Date(utc).toISOString();
  }
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(raw)) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
