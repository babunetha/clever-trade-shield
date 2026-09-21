type AgentName = "BULL" | "BEAR" | "RISK" | "VALIDATOR";

export interface AgentMarketSnapshot {
  symbol: string;
  name?: string;
  price: number;
  scanClose?: number;
  changePct?: number;
  rsi14?: number | null;
  atr14?: number | null;
  rvol?: number | null;
  pctOf52wHigh?: number | null;
  tradedValueCr?: number | null;
  niftyBias?: string;
  sectorChangePct?: number;
  entry: number;
  stopLoss: number;
  target1: number;
  target2?: number;
  riskReward: number;
}

export interface AgentOpinion {
  agent: AgentName;
  decision: "BUY" | "WAIT" | "AVOID";
  confidence: number;
  reasons: string[];
  risks: string[];
  notes: string;
}

export interface AgentValidationResult {
  symbol: string;
  finalDecision: "BUY" | "WAIT" | "AVOID";
  confidence: number;
  entry: number;
  stopLoss: number;
  target1: number;
  riskReward: number;
  bull: AgentOpinion;
  bear: AgentOpinion;
  risk: AgentOpinion;
  validator: AgentOpinion;
  disclaimer: string;
}

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");
  return key;
}

async function askGemini(systemInstruction: string, payload: unknown): Promise<AgentOpinion> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": getApiKey(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              decision: { type: "STRING", enum: ["BUY", "WAIT", "AVOID"] },
              confidence: { type: "NUMBER" },
              reasons: { type: "ARRAY", items: { type: "STRING" } },
              risks: { type: "ARRAY", items: { type: "STRING" } },
              notes: { type: "STRING" },
            },
            required: ["decision", "confidence", "reasons", "risks", "notes"],
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!text) throw new Error("Gemini returned no usable agent response.");

  const parsed = JSON.parse(text) as Omit<AgentOpinion, "agent">;
  return {
    agent: "VALIDATOR",
    decision: parsed.decision,
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 6) : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 6) : [],
    notes: String(parsed.notes ?? "").slice(0, 1200),
  };
}

export async function runTradingAgents(snapshot: AgentMarketSnapshot): Promise<AgentValidationResult> {
  const base = {
    role: "India equity swing/intraday research assistant",
    rule: "Analyze only the supplied market data. Do not invent prices, news, fundamentals, or indicators. This is decision support, not an order instruction.",
    market: snapshot,
  };

  const bull = await askGemini(
    "You are the BULL agent. Find concrete evidence supporting a long trade. Be skeptical and identify what would invalidate the bullish thesis.",
    base,
  );
  bull.agent = "BULL";

  const bear = await askGemini(
    "You are the BEAR agent. Try to disprove a long trade. Look for trend weakness, poor risk/reward, overextension, low liquidity, and missing confirmation. Do not invent facts.",
    base,
  );
  bear.agent = "BEAR";

  const risk = await askGemini(
    "You are the RISK agent. Focus only on downside, stop-loss distance, risk/reward, volatility, liquidity, and whether the supplied setup should be rejected for risk reasons. Do not change numeric prices.",
    base,
  );
  risk.agent = "RISK";

  const validator = await askGemini(
    "You are the FINAL VALIDATOR. Reconcile the Bull, Bear, and Risk opinions. Only return BUY when the supplied setup has adequate evidence and risk/reward. Otherwise return WAIT or AVOID. Never invent missing data.",
    { ...base, agents: { bull, bear, risk } },
  );
  validator.agent = "VALIDATOR";

  return {
    symbol: snapshot.symbol,
    finalDecision: validator.decision,
    confidence: validator.confidence,
    entry: snapshot.entry,
    stopLoss: snapshot.stopLoss,
    target1: snapshot.target1,
    riskReward: snapshot.riskReward,
    bull,
    bear,
    risk,
    validator,
    disclaimer: "AI analysis is informational decision support. It does not guarantee returns and does not place broker orders.",
  };
}
