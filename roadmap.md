# Clever Trade Shield — Remaining Work

## Done (verified earlier)
- Core app, 8 routes, risk guardrails (₹1,00,000 / ₹500 / ₹1,000 daily / 3 trades/day / lock after 2 losses / weekly ₹2,500 / max 2 open), live execution hard-disabled.
- Weekly-loss + open-position caps enforced in `risk-engine.ts` and `server-risk.ts`.
- Backtest panel on Scanner.

## Open tasks
- [ ] Audit logging: scanner run events, verification results, quote/connection errors (extend store `log` exposure + wire in `scanner.tsx`).
- [ ] AI candidate evidence analysis (NEW user request): submit a scanner candidate's indicators + news context; AI Gateway model summarizes bullish/bearish evidence and flags risk factors. UI on Scanner + server fn via `/v1/responses` (openai/gpt-6-astra).
- [ ] Pre-market checklist screen (09:00 IST: Dhan credential status, risk budgets reset, session config, open positions, pending approvals).
- [ ] Journal AI coach ("Analyze my session") via AI Gateway, graceful "not configured" fallback.
- [ ] Lint clean, `bun run security:check`, `bun run build`, browser verification of all routes.
- [ ] (Blocked on user) Real Dhan data + WebSocket streaming: needs `DHAN_CLIENT_ID` + `DHAN_ACCESS_TOKEN` backend secrets and Dhan data subscription.
