# Clever Trade Shield — Master Trading Specification

## Objective
Build a serious Indian equity trading assistant around ₹1,00,000 capital. Use real Dhan market data, multi-agent/strategy validation, strict server-side risk controls, paper-trading performance measurement, then controlled semi-automatic Dhan execution. Full automation is a later phase and must remain disabled until explicitly enabled.

## Phase 1 — Live data + paper trading
- Dhan live market quote feed through the authenticated server boundary.
- Market overview refreshes live Dhan prices and clearly labels LIVE vs SIMULATED.
- Dhan-derived technical signals use real 5-minute candles.
- Approved signals create paper trades only.
- Paper positions are marked to live Dhan prices.
- Journal tracks realised and unrealised P&L and strategy statistics.
- No broker order is transmitted.

## Phase 2 — Semi-automatic live trading
Flow: live data → strategy → bull/bear/risk/portfolio validation → server risk gate → trade proposal → explicit user approval → Dhan order → order updates → reconciliation → journal.
- User approval is mandatory.
- Every order must pass the server-side risk gate.
- Dhan credentials are server-only.
- Use correlation IDs and durable idempotency.
- Never retry an order POST after timeout; reconcile first.
- Handle partial fills, rejects, cancellations and terminal-state protection.
- Maintain an emergency kill switch.

## Risk policy
- Capital: ₹1,00,000.
- Maximum risk/trade: ₹500.
- Maximum daily loss: ₹1,000.
- Maximum weekly loss: ₹2,500.
- Maximum trades/day: 3.
- Maximum open positions: 2.
- Lock after 2 consecutive losses / daily loss limit.
- Minimum risk/reward: 1.5.
- Equity intraday only.
- F&O/options disabled.

## Phase 3 — Production hardening
- HTTPS production deployment.
- Fixed outbound/static IP for Dhan order APIs.
- Secret storage.
- Monitoring and backups.
- Durable broker reconciliation.
- Postback/order-update ingestion.
- Audit trail.
- Idempotency.
- Failure/timeout/reconnect tests.
- Independent security review before meaningful real-money use.

## Phase 4 — Full automation
Only after the previous phases are validated. Keep a separate server-controlled automation gate, emergency kill switch, loss limits, position limits, stale-data protection, broker-health checks and fail-closed behaviour.

## Non-negotiable security rules
- Never expose DHAN_CLIENT_ID or DHAN_ACCESS_TOKEN to browser/client code.
- Never log or return credentials.
- Never put secrets in VITE_/PUBLIC_ variables.
- Live execution must be OFF by default.
- UI controls must not be able to bypass server gates.
- Stale or unavailable market data must not produce a live order.
- A failed/unknown order state must reconcile by correlation ID before retry.
