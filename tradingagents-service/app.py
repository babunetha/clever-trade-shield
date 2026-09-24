import os
import secrets
from datetime import date
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

SERVICE_VERSION = "cts-tradingagents-1.1"
SERVICE_TOKEN = os.getenv("TRADINGAGENTS_SERVICE_TOKEN", "").strip()
if not SERVICE_TOKEN:
    raise RuntimeError("TRADINGAGENTS_SERVICE_TOKEN must be set")

app = FastAPI(title="Clever Trade Shield TradingAgents Service", version=SERVICE_VERSION)

SUPPORTED_ANALYSTS = {"market", "social", "news", "fundamentals"}


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
    # Indian NSE equity symbols must use the .NS suffix for TradingAgents/yfinance.
    if not value.endswith(".NS") and not value.startswith("^"):
        value = value + ".NS"
    return value


def build_config() -> dict:
    cfg = DEFAULT_CONFIG.copy()
    cfg["checkpoint_enabled"] = False
    cfg["max_debate_rounds"] = int(os.getenv("TRADINGAGENTS_MAX_DEBATE_ROUNDS", "1"))
    cfg["max_risk_discuss_rounds"] = int(os.getenv("TRADINGAGENTS_MAX_RISK_ROUNDS", "1"))
    cfg["output_language"] = os.getenv("TRADINGAGENTS_OUTPUT_LANGUAGE", "English")
    cfg["benchmark_ticker"] = "^NSEI"
    # Keep TradingAgents on India-compatible data vendors. Dhan/NSE snapshots
    # are supplied by Clever Trade Shield as request context for verification.
    cfg["data_vendors"] = {
        **cfg.get("data_vendors", {}),
        "core_stock_apis": os.getenv("TRADINGAGENTS_CORE_VENDOR", "yfinance"),
        "technical_indicators": os.getenv("TRADINGAGENTS_TECHNICAL_VENDOR", "yfinance"),
        "fundamental_data": os.getenv("TRADINGAGENTS_FUNDAMENTAL_VENDOR", "yfinance"),
        "news_data": os.getenv("TRADINGAGENTS_NEWS_VENDOR", "yfinance"),
    }
    return cfg


def extract_reports(final_state: Any) -> dict[str, Any]:
    if not isinstance(final_state, dict):
        return {}
    reports: dict[str, Any] = {}
    mapping = {
        "market_report": "market",
        "sentiment_report": "sentiment",
        "news_report": "news",
        "fundamentals_report": "fundamentals",
        "trader_investment_plan": "trader",
        "final_trade_decision": "portfolioDecision",
    }
    for source, target in mapping.items():
        value = final_state.get(source)
        if value:
            reports[target] = value
    debate = final_state.get("investment_debate_state")
    if isinstance(debate, dict):
        for source, target in (("bull_history", "bull"), ("bear_history", "bear"), ("judge_decision", "researchManager")):
            value = debate.get(source)
            if value:
                reports[target] = value
    return reports


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
    selected = [x.strip().lower() for x in req.selected_analysts if x.strip().lower() in SUPPORTED_ANALYSTS]
    if not selected:
        selected = ["market", "social", "news", "fundamentals"]

    try:
        graph = TradingAgentsGraph(
            selected_analysts=selected,
            debug=False,
            config=build_config(),
        )
        final_state, decision = graph.propagate(ticker, analysis_date)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TradingAgents analysis failed: {type(exc).__name__}") from exc

    reports = extract_reports(final_state)
    if decision is None and not reports:
        raise HTTPException(
            status_code=502,
            detail="TradingAgents completed without a decision or research reports",
        )

    return {
        "ok": True,
        "engine": "TradingAgents",
        "engineVersion": SERVICE_VERSION,
        "ticker": ticker,
        "analysisDate": analysis_date,
        "selectedAnalysts": selected,
        "decision": decision,
        "reports": reports,
        "nseContext": req.context.get("nse") if isinstance(req.context, dict) else None,
        "moneycontrolContext": req.context.get("moneycontrol") if isinstance(req.context, dict) else None,
        "contextAccepted": bool(req.context),
        "execution": {"allowed": False, "mode": "RESEARCH_ONLY", "broker": None},
    }
