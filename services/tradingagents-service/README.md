# TradingAgents research service

This service wraps the official TauricResearch TradingAgents v0.5.0 Python framework behind a small authenticated HTTP API.

## Boundary

TradingAgents is research-only in Clever Trade Shield.

The service:
- runs the multi-agent research graph;
- may use TradingAgents data vendors;
- can receive portfolio context for research;
- returns a research decision.

The service does not:
- receive Dhan credentials;
- place, modify, or cancel broker orders;
- bypass the Clever Trade Shield risk engine;
- become the source of truth for executable order prices.

The application keeps Dhan market data, deterministic risk controls, approval, execution, reconciliation, and emergency-stop controls outside this service.

## Configuration

Required:
- TRADINGAGENTS_SERVICE_TOKEN
- one supported TradingAgents LLM provider API key, such as OPENAI_API_KEY, GOOGLE_API_KEY, or ANTHROPIC_API_KEY.

TradingAgents provider/model configuration can also be supplied with its documented TRADINGAGENTS_* environment variables.

## Run

pip install -r requirements.txt
export TRADINGAGENTS_SERVICE_TOKEN='replace-me'
export OPENAI_API_KEY='replace-me'
uvicorn app:app --host 0.0.0.0 --port 8080

Health: GET /health
Research: POST /research with Authorization: Bearer <service-token>

Callers should pass exchange-qualified Indian symbols such as RELIANCE.NS. The upstream framework documents India support using .NS and .BO Yahoo Finance symbols.
