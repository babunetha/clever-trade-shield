import os
import secrets
from datetime import date
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

SERVICE_VERSION = "cts-tradingagents-1.0"
SERVICE_TOKEN = os.getenv("TRADINGAGENTS_SERVICE_TOKEN", "").strip()
if not SERVICE_TOKEN:
    raise RuntimeError("TRADINGAGENTS_SERVICE_TOKEN must be set")

app = FastAPI(title="Clever Trade Shield TradingAgents Service", version=SERVICE_VERSION)


class AnalyzeRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=32)
    analysis_date: str | None = None
    selected_analysts: list[str] = Field(default_factory=lambda: ["market", "social", "news", "fundamentals"])
    context: dict[str, Any] = Field(default_factory=dict)


def authorize(authorization: str | None) -> None:
    expected = f"Bearer {SERVICE_TOKEN}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def validate_ticker(ticker: str) -> str:
    value = ticker.strip().upper()
    if not value or len(value) > 32:
        raise HTTPException(status_code=400, detail="Invalid ticker")
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_^")
    if any(ch not in allowed for ch in value):
        raise HTTPException(status_code=400, detail="Invalid ticker")
    return value


def build_config() -> dict:
    cfg = DEFAULT_CONFIG.copy()
    cfg["checkpoint_enabled"] = False
    cfg["max_debate_rounds"] = int(os.getenv("TRADINGAGENTS_MAX_DEBATE_ROUNDS", "1"))
    cfg["max_risk_discuss_rounds"] = int(os.getenv("TRADINGAGENTS_MAX_RISK_ROUNDS", "1"))
    cfg["output_language"] = os.getenv("TRADINGAGENTS_OUTPUT_LANGUAGE", "English")
    return cfg


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "clever-trade-shield-tradingagents",
        "version": SERVICE_VERSION,
        "engine": "TradingAgents",
        "execution": {"allowed": False, "mode": "RESEARCH_ONLY", "broker": None},
    }


@app.post("/analyze")
def analyze(req: AnalyzeRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    ticker = validate_ticker(req.ticker)
    analysis_date = req.analysis_date or date.today().isoformat()

    try:
        # TradingAgents is used strictly as a research engine.
        graph = TradingAgentsGraph(debug=False, config=build_config())
        _, decision = graph.propagate(ticker, analysis_date)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TradingAgents analysis failed: {type(exc).__name__}") from exc

    return {
        "ok": True,
        "engine": "TradingAgents",
        "engineVersion": SERVICE_VERSION,
        "ticker": ticker,
        "analysisDate": analysis_date,
        "selectedAnalysts": req.selected_analysts,
        "decision": decision,
        "contextAccepted": bool(req.context),
        "execution": {"allowed": False, "mode": "RESEARCH_ONLY", "broker": None},
    }
