# Clever Trade Shield

Professional Indian market research and risk-controlled trading terminal for Dhan.

## Safety status

**LIVE ORDER EXECUTION: DISABLED**

The application is designed so market data and research can be connected to Dhan while live order placement remains blocked. Authentication, CSRF, server-side broker boundaries, durable Supabase order state, idempotency, Dhan postback ingestion, reconciliation, risk controls, security headers and automated security checks are part of the application.

## Architecture

The current build follows the requested architecture:

MARKET DATA ENGINE → DHAN

AI RESEARCH → Technical / News / Fundamental / Sentiment → Bull/Bear Debate → Research Manager → Trader → Risk Management → Portfolio Manager → RISK ENGINE → Semi-Automatic Approval → DHAN API → Order Execution

The final order-execution layer is present behind a multi-condition server gate and remains OFF by default. Phase 1 live-data/paper-trading is supported; Phase 2 semi-automatic execution requires explicit production configuration and user approval. See [docs/MASTER_TRADING_SPEC.md](docs/MASTER_TRADING_SPEC.md) for the complete requirements.

## Security configuration

Set these server-side only:

- `DHAN_CLIENT_ID`
- `DHAN_ACCESS_TOKEN`
- `APP_SESSION_SECRET` — random, at least 32 characters
- `APP_LOGIN_PASSWORD_HASH` — scrypt password hash generated with `bun run auth:hash-password`

Never prefix Dhan or authentication secrets with `VITE_` or `PUBLIC_`. `.env` and `.env.*.local` are ignored; `.env.example` contains placeholders only. If a real secret was ever committed to Git history, rotate it immediately even if it has since been removed.

## Current trading workflow\n\n1. **Live Dhan data:** authenticated server-side quote/candle reads; the Market and Signals screens clearly label live data.\n2. **Paper trading:** approved signals are simulated and the journal can mark open paper positions against live Dhan prices.\n3. **Semi-automatic execution:** durable order intent, idempotency, server risk gate, Dhan order adapter, postback/reconciliation and cancellation paths are implemented, but the production live gate is closed by default.\n4. **Full automation:** intentionally not enabled; it is a later phase requiring a separately reviewed automation gate.\n\n## Development

```sh
bun install
bun run dev
```

Security checks:
 
```sh
bun run security:check
bun run build
```

Secret scanning also runs in GitHub Actions with Gitleaks on pushes and pull requests.

### Durable broker state

Supabase stores order intents, broker orders, broker trades, Dhan postbacks and risk events. All exposed tables use RLS with deny-by-default policies; server access uses the Supabase service-role key only on the backend.

Configure Dhan Postback URL as `https://<your-app-host>/api/public/dhan/postback?token=<DHAN_POSTBACK_SECRET>`. Dhan sends order-status changes and partial-fill updates to this URL; the application verifies the shared secret and Dhan client ID before persisting them.

See [docs/SECURITY.md](docs/SECURITY.md) for the real-money readiness gate.
