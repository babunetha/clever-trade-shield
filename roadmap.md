# Clever Trade Shield — Remaining Work

## AI Market Researcher (user chose integrated app)
- [x] Build owner-only Researcher foundation with resumable NSE instrument batches, saved Dhan candles, OHLCV/order/freshness checks, basic technical evidence and daily real-history validation.
- [x] Add saved research ideas, existing direct OpenAI evidence review and versioned watchlist handoff to CTS; daily ideas cannot authorize intraday trades.
- [x] Verify signed-in research request, saved run reload and phone layout; 51 tests pass, security check passes, lint has no errors and harness build OK.
- [ ] Verify valid-data research, live AI evidence and populated CTS handoff end-to-end: blocked by Dhan history access rejection (401/403); no substitute mock ideas were generated.
- [ ] Complete external-source macro/news/fundamentals and verified morning briefing: requires source access and a verified scheduler.

### Not delivered in this foundation
Advanced VCP/SMT/PSP/CISD/volume-profile research, intraday strategy backtesting, automatic full-universe background scanning, dedicated Researcher paper portfolio and strategy_result.v1 return handoff remain outside the delivered foundation. Sources show unavailable rather than invented evidence. Current scans advance three instruments per explicit batch; observed instrument master contains 10,066 NSE EQUITY rows before liquidity/series exclusions. Existing CTS paper trading is preserved.

## Done (verified earlier)
- Core app, 8 routes, risk guardrails (₹1,00,000 / ₹500 / ₹1,000 daily / 3 trades/day / lock after 2 losses / weekly ₹2,500 / max 2 open), live execution hard-disabled.
- Weekly-loss + open-position caps enforced in `risk-engine.ts` and `server-risk.ts`.
- Backtest panel on Scanner.

## Completed in this phase
- [x] Add owner-only AI Gateway email-confirmation guidance in Settings with sanitized inputs and durable denial pauses; a real owner request returned safe steps, desktop/phone checked, 46 tests pass. Verification remains unchanged; unconfirmed owners still use normal confirmation on the sign-in page.
- [x] Add loading, startup and error recovery with retry and sign-in status; desktop/mobile failure, retry, sign-in navigation and blocked-script startup verified; 39 tests pass. Signed-in recovery remains unverified because the requesting user has no app account available for testing.
- [x] Correct the hosted server format causing `Bun is not defined`; deployment regression tests pass, the blank public index override is removed, and / opens the login page locally. Hosted rebuild remains to be verified.
- [x] Audit logging for scanner runs, verification, quote errors, AI evidence and paper approvals.
- [x] Direct server-only OpenAI candidate evidence with operator-supplied news context; Gemini committee preserved.
- [x] Pre-market checklist and navigation.
- [x] Journal AI session review with safe unavailable-configuration response.
- [x] Resolve compile/runtime errors, run security/risk/research tests and lint; latest harness build OK.
- [x] Browser UI checks for all eleven content screens with explicitly mocked services; actual login/missing-configuration checks.

## External blockers / remaining verification
- [x] Sign-in moved to the app's own account system (email + password); first account becomes the only owner; verified end-to-end in the browser.
- [x] Preview was blocked by frame/connection security headers — fixed.
- [x] Paper-trade and audit records now have server-only storage tables.
- [ ] Real Dhan connection/quotes/reconnect and server-side streaming: Dhan secrets, data entitlement and a tested secure relay required; current scanner uses foreground HTTP polling.
- [ ] Real AI/news-service results: server provider keys and external TradingAgents/news service configuration required.
- [ ] Durable cross-device records: existing server storage credentials and reviewed migrations required.

See `docs/FINAL_STATUS.md` for the delivered scope and verification limitations. Live orders remain hard-disabled.
