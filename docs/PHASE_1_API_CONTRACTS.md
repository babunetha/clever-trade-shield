# Phase 1 — API Contracts, Event Schemas, and Risk Policy

**Status:** Proposed contract baseline for review  
**Compatibility rule:** Additive changes only within a major version. Breaking changes require a new major schema version.  
**Execution:** All examples describe research or paper workflows. No live-order API is defined.

## 1. Contract conventions

- JSON over authenticated HTTPS for request/response APIs; durable jobs for work that may outlive a request.
- Timestamps are RFC 3339 UTC strings. Preserve the provider's original timestamp and timezone interpretation where the provider does not return UTC.
- Money and prices are decimal strings, not binary floating-point JSON numbers.
- Quantities are integers unless an instrument explicitly supports fractional quantity.
- Every event has an immutable `event_id`, `schema_version`, `occurred_at`, and `recorded_at`.
- Every market observation has a source identity and quality status.
- Unknown or unavailable values are `null` with a reason/status; do not substitute zero.
- Idempotency keys are unique within an owner and operation scope.
- All user-owned records carry an authenticated `owner_id`; services must not trust a caller-supplied owner ID without authorization.

## 2. Shared enums

### Data status
- `OK`: required fields present and within freshness/quality limits.
- `STALE`: a value exists but its source event time exceeds the configured age limit.
- `NOT_AVAILABLE`: absent, malformed, unmapped, or untrusted value.
- `DELAYED`: provider explicitly identifies delayed data and policy allows it for display only.
- `CONFLICT`: credible sources disagree beyond configured tolerance.

### Job status
`QUEUED | RUNNING | RETRY_WAIT | COMPLETED | PARTIAL | FAILED | CANCELLED`

### Research decision
`PASS | WATCH | REJECT | NOT_AVAILABLE`

A `PASS` means the research rule set passed; it is not a broker order authorization.

## 3. Market observation — `market_observation.v1`

```json
{
  "schema_version": "market_observation.v1",
  "observation_id": "uuid",
  "instrument": {
    "exchange": "NSE",
    "segment": "EQUITY",
    "symbol": "EXAMPLE",
    "series": "EQ",
    "security_id": "provider-specific-id"
  },
  "kind": "QUOTE",
  "source": {
    "provider": "DHAN",
    "source_event_time": "2026-11-20T09:30:00Z",
    "fetched_at": "2026-11-20T09:30:02Z",
    "sequence": null
  },
  "values": {
    "last_price": "123.45",
    "open": "122.00",
    "high": "124.00",
    "low": "121.50",
    "close": null,
    "volume": 123456,
    "average_price": "122.90"
  },
  "quality": {
    "status": "OK",
    "age_seconds": 2,
    "max_age_seconds": 20,
    "reasons": []
  }
}
```

Rules:
- `source_event_time` is the provider/exchange event time, never generated from `fetched_at`.
- `age_seconds = now - source_event_time`; calculate at evaluation time, not once at ingestion.
- If the provider does not expose event time, set it to null and status to `NOT_AVAILABLE` for freshness-gated decisions.
- A recently fetched old quote remains stale.
- Retain raw provider payload in restricted diagnostic storage where permitted; normalized values remain provider-attributed.

## 4. Instrument identity — `instrument.v1`

Required fields: `exchange`, `segment`, `symbol`, `series`, `provider`, `provider_security_id`, `valid_from`, `valid_to`, `master_version`.

A symbol alone is not a unique instrument key. Resolve provider security IDs using a dated instrument-master snapshot. Reject unknown/ambiguous mappings.

## 5. Research candidate — `research_candidate.v1`

```json
{
  "schema_version": "research_candidate.v1",
  "candidate_id": "uuid",
  "run_id": "uuid",
  "instrument": {
    "exchange": "NSE",
    "segment": "EQUITY",
    "symbol": "EXAMPLE",
    "series": "EQ",
    "security_id": "provider-specific-id"
  },
  "setup_type": "LONG_PULLBACK",
  "timeframe": "1D",
  "decision": "WATCH",
  "watch_trigger": "Close above the recorded resistance with valid volume",
  "invalidation": "Close below the recorded swing low",
  "evidence": [
    {
      "name": "ema_10",
      "value": "121.40",
      "status": "OK",
      "observation_ids": ["uuid"]
    }
  ],
  "missing_fields": [],
  "strategy_version": "strategy-id@semver",
  "market_snapshot_id": "uuid",
  "created_at": "2026-11-20T10:00:00Z",
  "expires_at": "2026-11-20T15:30:00Z"
}
```

Rules:
- Candidate evidence must reference immutable observation IDs/snapshot IDs.
- `WATCH` requires both a specific trigger and invalidation.
- `PASS` is not permission to place an order.
- Candidate expiry is explicit; expired candidates must be revalidated.
- Preserve current `research_candidate.v1` consumers during migration; add fields compatibly or publish a new version if existing consumers cannot accept them.

## 6. Strategy result — `strategy_result.v1`

Purpose: stable output from deterministic strategy evaluation and backtesting.

Required fields:
- `schema_version`, `result_id`, `run_id`, `strategy_id`, `strategy_version`
- `instrument`, `timeframe`, `market_snapshot_id`, `evaluated_at`
- `decision`, `setup_type`, `entry_rule`, `invalidation_rule`
- `evidence_refs[]`, `missing_fields[]`, `quality_status`
- `metrics` object with only computed/available values
- `provenance` containing data provider IDs, calculation engine version, and configuration hash

No strategy result may fabricate a price, indicator, confidence score, or fill. A missing mandatory input produces `NOT_AVAILABLE`, not an estimated substitute.

## 7. AI research result — `ai_research_result.v1`

Required fields:
- `schema_version`, `research_id`, `candidate_id`, `created_at`
- `model_provider`, `model_id`, `prompt_version`
- `bull_case`, `bear_case`, `risks[]`, `catalysts[]`
- `claims[]`, each with `claim`, `source_refs[]`, `published_at`, `retrieved_at`
- `contradictions[]`, `unknowns[]`, `summary`
- `advisory_only: true`

AI must not return an order approval, change risk limits, or supply authoritative market prices/indicator values. Reject malformed output. Uncited claims must be marked unverified. External content is untrusted input and must not be followed as instructions.

## 8. Scan job — `scan_job.v1`

Create request:
```json
{
  "schema_version": "scan_job.v1",
  "universe": "NSE_CASH_ELIGIBLE",
  "strategy_ids": ["daily_breakout"],
  "timeframes": ["1D"],
  "as_of": "2026-11-20T09:15:00Z",
  "mode": "PAPER_RESEARCH"
}
```

Job record includes `job_id`, `status`, `universe_version`, `total_instruments`, `processed_count`, `stage_counts`, `checkpoint`, `attempt`, `started_at`, `updated_at`, `completed_at`, and structured errors.

Requirements:
- The same idempotency key must return the same job/result, not start a duplicate scan.
- Checkpoint after bounded batches; resume from last committed checkpoint.
- Record per-stage eligible/pass/reject/not-available counts and reason codes.
- A partial scan must never be represented as a full-universe scan.
- Worker leases expire safely; retries are bounded and observable.

## 9. Paper order intent — `paper_order_intent.v1`

```json
{
  "schema_version": "paper_order_intent.v1",
  "intent_id": "uuid",
  "owner_id": "authenticated-owner",
  "idempotency_key": "client-generated-unique-key",
  "candidate_id": "uuid",
  "instrument": {"exchange": "NSE", "segment": "EQUITY", "symbol": "EXAMPLE", "series": "EQ"},
  "side": "BUY",
  "quantity": 10,
  "order_type": "LIMIT",
  "limit_price": "123.45",
  "stop_price": "120.00",
  "target_price": "130.00",
  "time_in_force": "DAY",
  "execution_mode": "PAPER",
  "risk_policy_version": "nse-cash-paper@1.0.0"
}
```

The server recomputes quantity, risk, exposure, reward/risk, and eligibility from current persisted state. Client-supplied calculations are informational only. This contract intentionally contains no live execution mode.

## 10. Risk decision — `risk_decision.v1`

Required fields:
- `decision_id`, `intent_id`, `policy_id`, `policy_version`, `evaluated_at`
- `decision: APPROVE_PAPER | REJECT | HOLD`
- `checks[]`: `check_id`, `passed`, `observed_value`, `limit_value`, `reason_code`
- `risk_amount`, `planned_reward_risk`, `daily_loss_after_trade`, `weekly_loss_after_trade`
- `portfolio_snapshot_id`, `market_snapshot_id`
- `fail_closed_reasons[]`

The decision is immutable and auditable. Re-evaluate if portfolio, quote, or policy version changes before simulated fill.

## 11. Paper execution events — `paper_execution_event.v1`

Statuses:
`PENDING | SIMULATING | SUBMITTED | PARTIALLY_FILLED | FILLED | REJECTED | CANCELLED | EXPIRED | UNKNOWN | RECONCILING`

Every transition emits an event with `event_id`, `intent_id`, `previous_status`, `new_status`, `occurred_at`, `recorded_at`, `fill_id` when applicable, `reason_code`, and `source`.

- Enforce legal transitions in one server-side state machine.
- Duplicate events are harmless through event ID/idempotency checks.
- An uncertain outcome becomes `UNKNOWN/RECONCILING`, never an automatic duplicate submit.
- Paper fills must record simulated price model, reference observation, slippage assumption, and fee model version.

## 12. Canonical policy — `nse-cash-paper@1.0.0`

| Rule | Baseline |
|---|---:|
| Reference paper capital | ₹100,000 |
| Max risk per trade | ₹500 |
| Max daily loss | ₹1,000 |
| Max weekly loss | ₹2,500 |
| Max new trades/day | 3 |
| Max concurrent open positions | 2 |
| Minimum planned reward/risk | 1.5 |
| Preferred reward/risk | 2.0 |
| Derivatives | Disabled |
| Market | NSE cash equities only |
| Execution | Paper only |

### Risk calculation rules
- Long risk per share = entry price minus structural stop, plus configured adverse slippage allowance and applicable costs.
- Short trades are not enabled in the initial cash-equity paper scope unless a separately reviewed product rule permits them; do not assume cash-equity short positions can be carried overnight.
- Quantity = floor(max permitted rupee risk / estimated all-in risk per share), then cap by available paper buying power and concentration rules.
- Planned reward/risk uses net target reward divided by net stop risk, including configured costs.
- Reject if stop is missing, stop is on the wrong side, quantity is zero, data is stale, or R:R < 1.5.
- Daily and weekly loss include realized paper P&L plus the policy-defined treatment of open risk; define one consistent accounting convention before coding.
- Loss counters and trade counts are server-calculated from the durable ledger, not client memory.

### Required hard checks
1. Authenticated owner and paper portfolio exists.
2. Instrument is valid NSE cash equity in allowed series.
3. Market data is current and quality status is `OK`.
4. Candidate is not expired and has a current intraday re-verification.
5. Entry, structural stop, target, quantity, and costs are present and valid.
6. Per-trade risk <= ₹500.
7. Daily loss after proposed trade <= ₹1,000.
8. Weekly loss after proposed trade <= ₹2,500.
9. New trade count <= 3 for the session/day.
10. Concurrent positions <= 2.
11. Planned net R:R >= 1.5.
12. No duplicate idempotency key or unresolved order state.
13. Policy version is enabled for paper use.
14. Any missing dependency produces `HOLD` or `REJECT`; never allow by default.

## 13. Error envelope

```json
{
  "schema_version": "api_error.v1",
  "error": {
    "code": "STALE_MARKET_DATA",
    "message": "Market data is too old for this decision.",
    "retryable": false,
    "correlation_id": "uuid",
    "details": {"data_status": "STALE"}
  }
}
```

Do not expose secrets, provider tokens, stack traces, or internal service credentials in error messages.

## 14. Minimum contract test suite

- Source event timestamp absent -> freshness-gated evaluation is NOT_AVAILABLE.
- Recently fetched quote with old source timestamp -> STALE.
- Duplicate instrument symbol with different series/security ID -> mapping rejected until resolved.
- Duplicate scan idempotency key -> one job.
- Worker crash after checkpoint -> resume without double-counting.
- Partial universe -> PARTIAL status, never COMPLETED.
- Candidate with WATCH but no trigger/invalidation -> schema rejection.
- Candidate research PASS -> does not create order intent automatically.
- AI output containing order approval or policy override -> ignored/rejected.
- Missing/stale quote, portfolio, or risk service -> paper intent held/rejected.
- Risk exactly at ₹500 passes only if all other constraints pass; ₹500.01 fails.
- Daily/weekly limits, max trades, and max positions enforce at boundaries.
- Duplicate paper execution event -> no duplicate fill.
- UNKNOWN order state -> reconciliation, not resubmission.
- User A cannot read or mutate User B's records.
- No route or worker can reach live Dhan order placement.

## 15. Phase 2 implementation order

1. Verify current database migrations and active route surface against these contracts.
2. Add shared schema/type package and contract tests.
3. Fix source timestamp capture and quote-health evaluation.
4. Consolidate risk policy into one server-owned versioned module; retain client checks only for UX.
5. Add durable scan job/checkpoint schema and worker boundary.
6. Add provider health and instrument mapping validation.
7. Only then connect worker implementations. Keep paper-only.

## 16. Open decisions requiring owner confirmation

- Whether daily and weekly loss limits include unrealized P&L and reserved open risk; proposed default is realized P&L plus worst-case remaining open risk for new-entry gating.
- Whether only long cash-equity paper positions are in scope initially; proposed default is long-only.
- Exact market data age thresholds by timeframe/session and behavior during auctions/halts.
- Whether service hosting remains Render or moves to an always-on worker environment.
- Final TradingAgents fork/tag and pinned commit.
