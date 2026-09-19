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
- CI runs security tests, source-boundary checks, formatting, lint and build; dependency audit is also included.
- Lovable runtime configuration and telemetry are removed from the active application.

## Real-money gate still closed

Passing these checks does **not** mean the app has zero vulnerabilities and does not authorize live trading.

Before any real-money order path is enabled, the project still needs:

1. Durable server-side order-intent/idempotency storage (database or Redis).
2. Durable order/trade reconciliation and Dhan order-update/postback ingestion.
3. Independent penetration/security review.
4. Dhan static-IP whitelist configured for order placement, modification and cancellation.
5. Controlled Dhan sandbox/paper tests for timeouts, duplicate approvals, partial fills and rejects.
6. A separately reviewed live-execution module with a physical kill switch.

Dhan's current v2 documentation requires access-token authentication and static IP whitelisting for order placement/modification/cancellation. Dhan also exposes order lookup by correlation ID and order/trade book APIs, which will be used by the future idempotency/reconciliation layer.
