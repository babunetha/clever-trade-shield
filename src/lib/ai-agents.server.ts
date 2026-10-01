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
  research?: {
    score: number;
    trades: number;
    winRate: number;
    expectancyR: number;
    /** Null means no finite profit factor was mathematically defined. */
    profitFactor: number | null;
    maxDrawdownR: number;
    totalR: number;
  };
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

const MODEL = process.env["GEMINI_MODEL"] || "gemini-2.5-flash";
const AI_TIMEOUT_MS = 15_000;

function getApiKey(): string {
  const key = process.env["GEMINI_API_KEY"]?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");
  return key;
}

async function askGemini(systemInstruction: string, payload: unknown): Promise<AgentOpinion> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  let text = "";

  try {
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
        signal: controller.signal,
      },
    );

    if (!response.ok) throw new Error(`Gemini request failed: HTTP ${response.status}`);
    const body = await response.json();
    text = body?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(text);
    const decision = parsed?.decision;
    if (!["BUY", "WAIT", "AVOID"].includes(decision)) throw new Error("Gemini returned an invalid decision.");
    const confidence = Number(parsed?.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error("Gemini returned invalid confidence.");
    return {
      agent: "VALIDATOR",
      decision,
      confidence,
      reasons: Array.isArray(parsed?.reasons) ? parsed.reasons.map(String) : [],
      risks: Array.isArray(parsed?.risks) ? parsed.risks.map(String) : [],
      notes: String(parsed?.notes ?? ""),
    };
  } finally {
    clearTimeout(timeout);
  }
}
