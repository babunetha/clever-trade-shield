# Clever Trade Shield — Security Gate

The application now has a real authentication boundary, CSRF protection, server-function authorization, complete client risk guardrails, security headers, and automated security checks.

## Enforced now

- HttpOnly, Secure-in-production, SameSite=Strict application session.
- Five-failure / 15-minute login throttle.
- Same-origin CSRF protection for every server function.
- Auth middleware on Dhan, market, scanner, technical and live-signal server functions.
- Private/no-store cache policy for authenticated server functions and the root app.
- Dhan credentials are server-only and never returned to the browser.
- Live Dhan order placement remains hard-disabled before any broker order request.
- Risk engine enforces trading switch, daily loss, rolling 7-day loss, max trades/day, max open positions, session hours, per-trade risk and minimum R:R.
- Response security headers: CSP baseline, frame denial, MIME sniffing protection, strict referrer policy, Permissions Policy and COOP/CORP.
- CI runs security tests, source-boundary checks, formatting, lint, build, and a high-severity dependency audit. GitHub's hosted Dependency Review action is not available for this personal private repository, so it is not used as a false security gate.
- Lovable runtime configuration and telemetry are removed from the active application.

## GitHub security note

GitHub documents Dependency Review as available for public repositories and eligible private repositories with GitHub Code Security/Advanced Security. This repository is a personal private repository, and GitHub currently rejects the Dependency Review action for it. The CI therefore relies on `bun audit --audit-level=high` plus the repository's source-boundary/security tests rather than pretending the unsupported check is passing.

## Real-money gate still closed

Passing these checks does **not** mean the app has zero vulnerabilities and does not authorize live trading.

Before any real-money order path is enabled, the project still needs:

1. Production live-execution module with explicit multi-factor server gate, idempotency, correlation-ID reconciliation, cancellation and state-machine handling.
2. Durable order/trade reconciliation and Dhan order-update/postback ingestion.
3. Production deployment with HTTPS, fixed outbound IP, secret storage, monitoring and backups.
4. Independent penetration/security review.
5. Dhan static-IP whitelist configured for order placement, modification and cancellation.
6. Controlled Dhan shadow/paper tests for timeouts, duplicate approvals, partial fills, cancellations and rejects.
7. A separately reviewed live-execution module with a physical kill switch, followed by a small first live trade.

Dhan's current v2 documentation requires access-token authentication and static IP whitelisting for order placement/modification/cancellation. Dhan also exposes order lookup by correlation ID and order/trade book APIs, which will be used by the future idempotency/reconciliation layer.


## Current live gate

The repository now contains the live execution adapter, but it remains closed by default. A live submission requires all of: `CTS_LIVE_EXECUTION_ENABLED=true`, `CTS_LIVE_EXECUTION_CONFIRMATION=ENABLE_LIVE_TRADING`, `RISK_TRADING_ENABLED=true`, Dhan credentials, `DHAN_POSTBACK_SECRET`, and `DHAN_STATIC_IP`. The application does not retry an order POST after a timeout; it marks the intent UNKNOWN and requires correlation-ID reconciliation first.
