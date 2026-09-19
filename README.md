# Clever Trade Shield

Professional Indian market research and risk-controlled trading terminal for Dhan.

## Safety status

**LIVE ORDER EXECUTION: DISABLED**

The application is designed so market data and research can be connected to Dhan while live order placement remains blocked. Authentication, CSRF, server-side broker boundaries, durable Supabase order state, idempotency, Dhan postback ingestion, reconciliation, risk controls, security headers and automated security checks are part of the application.

## Architecture

The current build follows the requested architecture:

MARKET DATA ENGINE → DHAN

AI RESEARCH → Technical / News / Fundamental / Sentiment → Bull/Bear Debate → Research Manager → Trader → Risk Management → Portfolio Manager → RISK ENGINE → Semi-Automatic Approval → DHAN API → Order Execution

The final order-execution layer remains physically disabled.

## Security configuration

Set these server-side only:

- `DHAN_CLIENT_ID`
- `DHAN_ACCESS_TOKEN`
- `APP_SESSION_SECRET` — random, at least 32 characters
- `APP_LOGIN_PASSWORD` — strong private operator password

Never prefix Dhan or authentication secrets with `VITE_` or `PUBLIC_`.

## Development

```sh
bun install
bun run dev
```

Security checks:

```sh
bun run security:check
bun run build
```

### Durable broker state

Supabase stores order intents, broker orders, broker trades, Dhan postbacks and risk events. All exposed tables use RLS with deny-by-default policies; server access uses the Supabase service-role key only on the backend.

Configure Dhan Postback URL as `https://<your-app-host>/api/public/dhan/postback?token=<DHAN_POSTBACK_SECRET>`. Dhan sends order-status changes and partial-fill updates to this URL; the application verifies the shared secret and Dhan client ID before persisting them.

See [docs/SECURITY.md](docs/SECURITY.md) for the real-money readiness gate.
