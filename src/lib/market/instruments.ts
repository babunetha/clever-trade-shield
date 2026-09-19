export interface DhanInstrument {
  securityId: string;
  tradingSymbol: string;
  customSymbol: string;
  exchangeSegment: "NSE_EQ" | "BSE_EQ" | "IDX_I" | string;
  instrument: string;
}

const MASTER_URL = "https://images.dhan.co/api-data/api-scrip-master.csv";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cache: { expiresAt: number; rows: DhanInstrument[] } | null = null;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

export async function loadDhanInstruments(): Promise<DhanInstrument[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.rows;
  const response = await fetch(MASTER_URL, { headers: { accept: "text/csv" } });
  if (!response.ok) throw new Error(`Dhan instrument master HTTP ${response.status}`);
  const text = await response.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("Dhan instrument master was empty");

  const header = parseCsvLine(lines[0]!);
  const index = (name: string) => header.indexOf(name);
  const id = index("SEM_SMST_SECURITY_ID");
  const exchange = index("SEM_EXM_EXCH_ID");
  const segment = index("SEM_SEGMENT");
  const symbol = index("SEM_TRADING_SYMBOL");
  const custom = index("SEM_CUSTOM_SYMBOL");
  const instrument = index("SEM_INSTRUMENT_NAME");

  if ([id, exchange, segment, symbol, instrument].some((v) => v < 0)) {
    throw new Error("Dhan instrument master schema changed; required columns were not found");
  }

  const rows: DhanInstrument[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]!);
    const exchangeValue = values[exchange];
    const segmentValue = values[segment];
    const instrumentValue = values[instrument];
    const exchangeSegment =
      exchangeValue === "NSE" && segmentValue === "E"
        ? "NSE_EQ"
        : exchangeValue === "BSE" && segmentValue === "E"
          ? "BSE_EQ"
          : exchangeValue === "IDX" || instrumentValue === "INDEX"
            ? "IDX_I"
            : "";

    if (!exchangeSegment) continue;
    const securityId = values[id]?.trim();
    const tradingSymbol = values[symbol]?.trim();
    if (!securityId || !tradingSymbol) continue;
    rows.push({
      securityId,
      tradingSymbol,
      customSymbol: custom >= 0 ? values[custom]?.trim() || tradingSymbol : tradingSymbol,
      exchangeSegment,
      instrument: instrumentValue ?? "",
    });
  }

  cache = { expiresAt: Date.now() + CACHE_TTL_MS, rows };
  return rows;
}

export async function resolveDhanInstruments(symbols: string[]): Promise<DhanInstrument[]> {
  const wanted = new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean));
  const rows = await loadDhanInstruments();
  const exact = rows.filter((row) => wanted.has(row.tradingSymbol.toUpperCase()));
  return symbols
    .map((symbol) => exact.find((row) => row.tradingSymbol.toUpperCase() === symbol.trim().toUpperCase()))
    .filter((row): row is DhanInstrument => Boolean(row));
}
