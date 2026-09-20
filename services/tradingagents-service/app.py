import os
from datetime import date
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.portfolio import PortfolioContext

app = FastAPI(title="Clever Trade Shield TradingAgents Research Service", version="0.5.0")

SERVICE_TOKEN = os.getenv("TRADINGAGENTS_SERVICE_TOKEN", "")
DEFAULT_ANALYSTS = ("market", "social", "news", "fundamentals")


class ResearchRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    analysis_date: str | None = None
    research_depth: int = Field(default=2, ge=1, le=5)
    analysts: list[str] | None = None
    portfolio: dict[str, Any] | None = None


def require_token(authorization: str | None) -> None:
    if not SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="TradingAgents service token is not configured")
    if authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def build_config(depth: int) -> dict[str, Any]:
    config = DEFAULT_CONFIG.copy()
    config["max_debate_rounds"] = min(depth, 3)
    config["max_risk_discuss_rounds"] = min(depth, 3)
    config["checkpoint_enabled"] = True
    config["temperature"] = 0.0
    return config


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "engine": "TradingAgents",
        "version": "0.5.0",
        "service": "research-only",
        "execution": "disabled",
    }


@app.post("/research")
def research(
    payload: ResearchRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_token(authorization)

    symbol = payload.symbol.strip().upper()
    if not any(ch.isalnum() for ch in symbol):
        raise HTTPException(status_code=400, detail="Invalid symbol")

    analysis_date = payload.analysis_date or date.today().isoformat()
    try:
        if date.fromisoformat(analysis_date) > date.today():
            raise HTTPException(status_code=400, detail="analysis_date cannot be in the future")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid analysis_date")

    analysts = tuple(payload.analysts or DEFAULT_ANALYSTS)
    allowed = set(DEFAULT_ANALYSTS)
    if not set(analysts).issubset(allowed):
        raise HTTPException(status_code=400, detail="Unsupported analyst type")

    graph = TradingAgentsGraph(
        selected_analysts=analysts,
        debug=False,
        config=build_config(payload.research_depth),
    )

    portfolio = None
    if payload.portfolio is not None:
        portfolio = PortfolioContext.model_validate(payload.portfolio)

    _, decision = graph.propagate(
        symbol,
        analysis_date,
        portfolio=portfolio,
    )

    return {
        "ok": True,
        "engine": "TradingAgents",
        "engineVersion": "0.5.0",
        "symbol": symbol,
        "analysisDate": analysis_date,
        "analysts": list(analysts),
        "decision": decision,
        "execution": {
            "allowed": False,
            "mode": "RESEARCH_ONLY",
            "broker": None,
        },
    }
