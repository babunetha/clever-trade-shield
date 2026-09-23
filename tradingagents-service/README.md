# Clever Trade Shield — TradingAgents Research Service

This is the external research-only service used by CLEVER TRADE SHIELD.

## Safety boundary

- Research only.
- No Dhan credentials.
- No order placement.
- No broker endpoints.
- Every response declares execution as `RESEARCH_ONLY`.
- CLEVER TRADE SHIELD remains the only component allowed to evaluate paper/live execution.

## Engine

Uses the official TauricResearch TradingAgents v0.5.0 package. The official project supports Python usage and Docker deployment.

## Endpoints

- `GET /health`
- `POST /analyze` with `Authorization: Bearer <TRADINGAGENTS_SERVICE_TOKEN>`

Example request:

```json
{
  "ticker": "RELIANCE.NS",
  "analysis_date": "2026-09-23",
  "selected_analysts": ["market", "social", "news", "fundamentals"]
}
```

## Deployment

The included `render.yaml` is a deployment definition for a Docker web service. Set the service token and one supported LLM provider API key as platform secrets.

After deployment, put the generated service URL in CLEVER TRADE SHIELD as `TRADINGAGENTS_SERVICE_URL` and use the exact same service token as `TRADINGAGENTS_SERVICE_TOKEN`.

Do not put either secret in frontend code or GitHub source files.
