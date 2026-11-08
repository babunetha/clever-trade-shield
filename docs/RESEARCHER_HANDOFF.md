# CTS ↔ AI Market Researcher handoff — v0.1 (draft)

Status: integrated watchlist handoff implemented. The user chose Researcher inside CTS. Owner-scoped saved research uses research_candidate.v1; the scanner inbox reads handed-off watchlist candidates, marks daily evidence stale, and requires a new independent intraday scan. This is not a TRADE approval or an external app API. strategy_result.v1 remains proposed.

## Researcher → CTS: `research_candidate.v1`
```json
{
  "schema": "research_candidate.v1",
  "generated_at": "ISO-8601 UTC",
  "symbol": "RELIANCE",
  "exchange": "NSE_EQ",
  "security_id": "string",
  "setup_type": "range_breakout",
  "verdict": "TRADE | WAIT | NO_TRADE",
  "evidence": [{ "field": "ema10", "value": 0, "source": "dhan", "source_ts": "ISO", "fetched_at": "ISO", "status": "OK | STALE | NOT_AVAILABLE" }],
  "trigger": "string",
  "invalidation": "string",
  "data_quality": { "status": "PASS | FAIL", "errors": [] },
  "strategy": { "id": "string", "version": "semver" }
}
```

## CTS → Researcher: `strategy_result.v1`
```json
{
  "schema": "strategy_result.v1",
  "strategy": { "id": "string", "version": "semver" },
  "in_sample": { "trades": 0, "win_rate": 0, "profit_factor": 0, "expectancy_r": 0, "max_drawdown": 0 },
  "out_of_sample": { "trades": 0, "win_rate": 0, "profit_factor": 0, "expectancy_r": 0, "max_drawdown": 0 },
  "paper": { "trades": 0, "net_pnl_inr": 0 },
  "warnings": []
}
```

## Rules
- Any missing or stale required field means CTS treats the candidate as NO_TRADE.
- CTS still runs its own risk engine; a Researcher verdict never bypasses it.
- No credentials or tokens ever travel in either payload.
