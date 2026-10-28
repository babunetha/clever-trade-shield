# Clever Trade Shield — Remaining Work

## Done (verified earlier)
- Core app, 8 routes, risk guardrails (₹1,00,000 / ₹500 / ₹1,000 daily / 3 trades/day / lock after 2 losses / weekly ₹2,500 / max 2 open), live execution hard-disabled.
- Weekly-loss + open-position caps enforced in `risk-engine.ts` and `server-risk.ts`.
- Backtest panel on Scanner.

## Completed in this phase
- [x] Audit logging for scanner runs, verification, quote errors, AI evidence and paper approvals.
- [x] Direct server-only OpenAI candidate evidence with operator-supplied news context; Gemini committee preserved.
- [x] Pre-market checklist and navigation.
- [x] Journal AI session review with safe unavailable-configuration response.
- [x] Resolve compile/runtime errors, run security/risk/research tests and lint; latest harness build OK.
- [x] Browser UI checks for all eleven content screens with explicitly mocked services; actual login/missing-configuration checks.

## External blockers / remaining verification
- [ ] Real authenticated end-to-end tests: application session secret and password hash are not configured.
- [ ] Real Dhan connection/quotes/reconnect and server-side streaming: Dhan secrets, data entitlement and a tested secure relay required; current scanner uses foreground HTTP polling.
- [ ] Real AI/news-service results: server provider keys and external TradingAgents/news service configuration required.
- [ ] Durable cross-device records: existing server storage credentials and reviewed migrations required.

See `docs/FINAL_STATUS.md` for the delivered scope and verification limitations. Live orders remain hard-disabled.
