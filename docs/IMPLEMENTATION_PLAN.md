# Clever Trade Shield — implementation plan

## Current baseline

The application is a TanStack Start + React + TypeScript trading terminal. It already contains dashboard, market, scanner, signals, approvals, journal, risk and settings routes; typed trading state; local persistence; simulated market data; paper trades; and server-only Dhan read interfaces. Live order placement is hard-disabled.

## Target architecture

UI -> server functions/API -> domain services -> broker/data adapters
                         |\n                         +-> strategy -> risk -> execution\n                         +-> audit / journal\n                         +-> AI research (later)

## Build order

1. Trading core: broker/data interfaces, deterministic strategy contract, centralized risk engine, paper execution.
2. Dhan read-only: profile, funds, holdings, positions, LTP and historical candles through server-only functions.
3. Data quality: timestamps, stale-feed detection, market-session validation and instrument mapping.
4. Indicators: EMA, RSI, VWAP, ATR, MACD, volume, then VCP and Market Profile.
5. Backtest: event-driven historical simulator, fees/slippage, out-of-sample and look-ahead checks.
6. AI research: LangGraph-style analyst/research/trader/risk workflow. AI consumes structured indicator data and cannot bypass deterministic risk controls.
7. Semi-auto: explicit approval creates an order proposal only. Keep live execution disabled.
8. Live execution: separately reviewed Dhan execution adapter, reconciliation, duplicate-order protection and emergency kill switch. Do not enable automatically.

## Non-negotiable safety rules

- No secrets in client code, localStorage, source control or logs.
- No live order endpoint while the live execution flag is false.
- AI cannot directly place an order.
- Risk engine can veto any proposal.
- Paper and live paths share the same order model.
- Broker state must be reconciled before future live execution.
- Every decision/order/fill/override is auditable.
- Backtests must prevent future-data leakage.

## Phase 1 acceptance criteria

- ExecutionAdapter exists with PAPER, SEMI_AUTO and LIVE_AUTO modes.
- PAPER mode can simulate an accepted order.
- LIVE_AUTO always rejects until a separately reviewed implementation replaces the disabled adapter.
- Risk calculations are pure and testable.
- Strategy interface exists and keeps calculations deterministic.
- Market data is accessed through an interface, not directly from UI components.
- Existing mock UI remains functional.
