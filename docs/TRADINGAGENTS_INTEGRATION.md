# TradingAgents integration

## Purpose

Clever Trade Shield now treats the official TauricResearch TradingAgents v0.5.0 framework as a research/AI-agent engine behind a separate Python service.

The integration deliberately preserves the existing trading infrastructure:

1. Dhan remains the authoritative broker/data boundary for the application.
2. TradingAgents is a research input, not an execution authority.
3. Bull/Bear/Risk/Portfolio/Validation controls remain in the application.
4. Server-side risk gates remain authoritative.
5. Paper trading remains available for validation.
6. Live execution remains separately gated and fail-closed.
7. TradingAgents receives no Dhan credentials.

## Research flow

Dhan/application market context -> TradingAgents research -> normalized research result -> existing decision/risk pipeline -> approval -> execution adapter

The TradingAgents service itself always returns execution.allowed=false.

## Why a separate service?

The existing Clever Trade Shield runtime is TypeScript/Bun-oriented, while TradingAgents is a Python package using LangGraph. The clean boundary is an authenticated HTTP adapter rather than embedding a second runtime into the application server.

## Version pin

The service pins tradingagents==0.5.0. Upgrade only after reviewing the upstream changelog and rerunning the research/paper-trading validation suite.

## Production rule

A TradingAgents result must never be treated as an order instruction. The application must re-check:
- market-data freshness;
- symbol/security-ID mapping;
- stop-loss/target validity;
- risk/reward;
- order and position limits;
- daily loss limit;
- portfolio concentration;
- market session;
- manual approval requirements;
- live execution gate.

If any check fails, the proposed setup is rejected or remains paper-only.
