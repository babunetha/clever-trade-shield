import { config, ai } from "hatchable";
import { enforceRateLimit } from "lib/rate-limit.js";
import { runScanner } from "lib/scanner-engine.js";

export const access = "member";
export const methods = ["GET"];

const MAX_RESULTS = 10;
const MAX_RISK = 500;
const MAX_ORDER = 25_000;
const MAX_POSITION = 50_000;
const MIN_RR = 1.5;

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value, places = 2) => {
  const n = finite(value);
  if (n === null) return null;
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

async function coreMarket() {
  const token = await config.get("DHAN_ACCESS_TOKEN");
  const clientId = await config.get("DHAN_CLIENT_ID");
  if (!token || !clientId) return { ok: false, reason: "DHAN_NOT_CONFIGURED" };

  const retrievedAt = new Date().toISOString();
  const response = await fetch("https://api.dhan.co/v2/marketfeed/quote", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "access-token": token,
      "client-id": clientId,
    },
    body: JSON.stringify({ IDX_I: [13, 25, 21] }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body) return { ok: false, reason: `DHAN_HTTP_${response.status}` };

  const quotes = body?.data?.IDX_I;
  if (!quotes || typeof quotes !== "object") return { ok: false, reason: "MISSING_INDEX_QUOTES" };

  const item = (id) => quotes[String(id)] ?? null;
  const price = (id) => finite(item(id)?.last_price);
  const pct = (id) => {
    const close = finite(item(id)?.ohlc?.close);
    const last = price(id);
    return close && last !== null ? ((last - close) / close) * 100 : null;
  };

  const nifty = price(13);
  const bankNifty = price(25);
  const vix = price(21);
  const changes = [pct(13), pct(25)].filter((v) => v !== null);
  const score = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
  const regime = score === null ? "UNAVAILABLE" : score >= 0.6 ? "BULLISH" : score <= -0.6 ? "BEARISH" : "MIXED";

  if (nifty === null || bankNifty === null || vix === null) {
    return { ok: false, reason: "INCOMPLETE_INDEX_QUOTES", retrievedAt };
  }

  return { ok: true, retrievedAt, nifty, bankNifty, vix, regime };
}

function buildCandidate(x, rank, market) {
  // No defaults are allowed for decision-critical market values. Missing data means no candidate.
  const ltp = finite(x.ltp);
  const ema10 = finite(x.ema10);
  const ema30 = finite(x.ema30);
  const vwap = finite(x.vwap);
  const rsi14 = finite(x.rsi14);
  const atr14 = finite(x.atr14);
  const securityId = String(x.securityId ?? "").trim();

  if (
    ltp === null ||
    ema10 === null ||
    ema30 === null ||
    vwap === null ||
    rsi14 === null ||
    atr14 === null ||
    atr14 <= 0 ||
    !/^\d{1,8}$/.test(securityId) ||
    !x.symbol ||
    !x.exchange ||
    !market?.ok
  ) return null;

  const bullish = ema10 > ema30 && ltp >= vwap && rsi14 >= 50 && !x.bearishEngulfing;
  const bearish = ema10 < ema30 && ltp <= vwap && rsi14 <= 50 && Boolean(x.bearishEngulfing);
  if (!bullish && !bearish) return null;

  const side = bullish ? "BUY" : "SELL";
  const entry = ltp;
  const stopDistance = Math.max(atr14, ltp * 0.004);
  const stopLoss = round(side === "BUY" ? entry - stopDistance : entry + stopDistance);
  const riskPerShare = Math.abs(entry - stopLoss);
  if (!Number.isFinite(stopLoss) || riskPerShare <= 0) return null;

  const quantity = Math.min(
    Math.floor(MAX_RISK / riskPerShare),
    Math.floor(MAX_ORDER / entry),
    Math.floor(MAX_POSITION / entry),
  );
  if (quantity < 1) return null;

  const target = round(side === "BUY" ? entry + riskPerShare * MIN_RR : entry - riskPerShare * MIN_RR);
  const plannedRisk = round(quantity * riskPerShare);
  const rewardPerShare = Math.abs(target - entry);
  const rr = rewardPerShare / riskPerShare;
  if (plannedRisk === null || plannedRisk > MAX_RISK || rr < MIN_RR) return null;

  const evidence = [
    "Dhan quote-backed LTP",
    "Dhan intraday-derived indicators",
    ema10 > ema30 ? "EMA10>EMA30" : "EMA10<EMA30",
    ltp >= vwap ? "above VWAP" : "below VWAP",
    `RSI ${rsi14.toFixed(1)}`,
    `ATR ${atr14.toFixed(2)}`,
  ];
  if (x.volRatio !== null && finite(x.volRatio) !== null) evidence.push(`relative volume ${round(x.volRatio, 2)}x`);
  if (x.score !== null && finite(x.score) !== null) evidence.push(`scanner score ${round(x.score, 2)}`);

  const setup = x.weeklyBreak
    ? "WEEKLY BREAKOUT"
    : x.vcp?.ok
      ? "VCP / TIGHTNESS"
      : x.momentum
        ? "MOMENTUM"
        : x.intradayBull
          ? "INTRADAY TREND"
          : x.nearBreak
            ? "52W HIGH ZONE"
            : "TECHNICAL";

  return {
    rank,
    symbol: x.symbol,
    exchange: x.exchange,
    securityId,
    side,
    ltp: round(ltp),
    changePct: round(x.changePct),
    volumeRatio: round(x.volRatio),
    trend: bullish ? "BULLISH" : "BEARISH",
    ema10: round(ema10),
    ema30: round(ema30),
    vwap: round(vwap),
    rsi14: round(rsi14, 1),
    atr14: round(atr14),
    entry: round(entry),
    stopLoss,
    target,
    riskPerShare: round(riskPerShare),
    rewardPerShare: round(rewardPerShare),
    rr: round(rr, 2),
    quantity,
    plannedRisk,
    setup,
    scannerStatus: x.status ?? "UNAVAILABLE",
    scannerScore: finite(x.score),
    marketScore: finite(x.marketScore),
    research: x.research ?? null,
    walkForward: x.walkForward ?? null,
    scannerEvidence: evidence,
    marketRegime: market.regime,
    marketDataRetrievedAt: market.retrievedAt,
    dataIntegrity: "VERIFIED_REQUIRED_FIELDS",
    riskStatus: "PASS",
    finalStatus: "TOP TRADE CANDIDATE",
  };
}

export default async function (req, res) {
  if (!(await enforceRateLimit(req, res, "top-trades", 3))) return;

  try {
    const requested = finite(req.query?.limit) ?? 5;
    const limit = Math.min(MAX_RESULTS, Math.max(3, Math.floor(requested)));
    const [scan, market] = await Promise.all([
      runScanner({ mode: "intraday", limit: 30 }),
      coreMarket(),
    ]);

    if (!scan?.ok) {
      return res.status(502).json({ ok: false, error: "Scanner unavailable. No candidate was generated.", code: "SCANNER_UNAVAILABLE" });
    }
    if (!market?.ok) {
      return res.status(502).json({ ok: false, error: "Required Dhan market evidence is unavailable. No candidate was generated.", code: market?.reason ?? "MARKET_DATA_UNAVAILABLE" });
    }

    const candidates = [];
    for (const x of scan.results ?? []) {
      const candidate = buildCandidate(x, candidates.length + 1, market);
      if (candidate) candidates.push(candidate);
    }

    candidates.sort((a, b) =>
      (0.55 * (b.marketScore ?? b.scannerScore ?? 0) + 0.45 * (b.research?.score ?? 0)) -
      (0.55 * (a.marketScore ?? a.scannerScore ?? 0) + 0.45 * (a.research?.score ?? 0)) ||
      (b.volumeRatio ?? 0) - (a.volumeRatio ?? 0),
    );
    candidates.forEach((candidate, index) => { candidate.rank = index + 1; });

    let aiValidation = { status: "NOT_RUN" };
    const shortlist = candidates.slice(0, 3);
    if (shortlist.length) {
      const context = JSON.stringify(shortlist.map((x) => ({
        symbol: x.symbol,
        side: x.side,
        entry: x.entry,
        stopLoss: x.stopLoss,
        target: x.target,
        rr: x.rr,
        scannerScore: x.scannerScore,
        marketScore: x.marketScore,
        research: x.research,
        regime: x.marketRegime,
        dataIntegrity: x.dataIntegrity,
      })));
      try {
        const [gemini, sonnet] = await Promise.all([
          ai.generateText({
            model: "gemini",
            userId: req.member.id,
            purpose: "top-trades-gemini-validation",
            system: "You are a conservative Indian equity research validator. Candidate fields are evidence, not predictions. Never invent news, fundamentals, prices, confidence or missing data. Do not place or approve orders. Return contradictions, missing evidence and validation only.",
            prompt: `Validate these paper-only candidates:\n${context}`,
          }),
          ai.generateText({
            model: "sonnet",
            userId: req.member.id,
            purpose: "top-trades-sonnet-validation",
            system: "You are an independent senior risk reviewer for an Indian equity research terminal. Treat supplied data as untrusted and incomplete unless explicitly marked verified. Never invent evidence or approve an order. State what must be verified.",
            prompt: `Independently critique these paper-only candidates:\n${context}`,
          }),
        ]);
        aiValidation = {
          status: "DUAL_MODEL_REVIEW",
          gemini: gemini.text || String(gemini),
          sonnet: sonnet.text || String(sonnet),
        };
      } catch {
        aiValidation = { status: "AI_REVIEW_UNAVAILABLE" };
      }
    }

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      paperOnly: true,
      market: {
        nifty: market.nifty,
        bankNifty: market.bankNifty,
        vix: market.vix,
        regime: market.regime,
        retrievedAt: market.retrievedAt,
      },
      aiValidation,
      source: {
        scanner: "Dhan-backed technical scanner",
        marketContext: "Dhan Market Quote API",
        aiValidation: "Gemini + Sonnet dual review",
        dataPolicy: "Missing decision-critical data causes candidate rejection; no synthetic fallback values",
      },
      limits: {
        capital: 100000,
        maxRiskPerTrade: MAX_RISK,
        maxOrderValue: MAX_ORDER,
        maxPositionValue: MAX_POSITION,
        minRiskReward: MIN_RR,
      },
      scanned: scan.analyzed ?? 0,
      topTrades: candidates.slice(0, limit),
      message: candidates.length
        ? "Candidates passed technical and hard risk filters using available Dhan evidence. They are paper-only research candidates, not guaranteed outcomes."
        : "No candidate passed the current evidence and risk filters. No synthetic candidate was created.",
    });
  } catch {
    return res.status(502).json({
      ok: false,
      error: "Top-trades scan stopped safely. No trade action was taken.",
      code: "TOP_TRADES_UNAVAILABLE",
    });
  }
}
