# Security Audit — 5 Prompt Review

Source: "AI APP BUILDER PROMPTS — 5 Security Checks Before You Launch Your App" (v1.1), supplied with this project. The guide asks the builder to run five checks in order: secret leakage, personal-data flow, production readiness, deep complex-logic review, and attacker-perspective review.

## 01 Secret Leak Prevention
- Dhan credentials are read only from server-side environment variables.
- No Dhan/auth secret is exposed through VITE_/PUBLIC_ variables.
- .env, .env.local and .env.*.local remain ignored.
- .env.example is tracked and contains placeholders only.
- Gitleaks CI scanning has been added for pushes and pull requests.
- README now warns that any previously committed secret must be rotated because removing it from the current tree does not remove Git history.
- The existing source security audit continues to reject forbidden public-secret patterns and source-enabled live execution.

## 02 Personal Data Flow Audit
- The app is currently a single-operator trading terminal; there is no multi-user profile, email, phone, address, DOB or payment-data collection flow.
- Operator authentication uses an HTTP-only, Secure-in-production, SameSite=Strict session cookie.
- The operator password is no longer configured as plaintext application data; authentication now requires an scrypt password hash.
- Dhan access tokens and broker credentials never enter browser storage or API responses.
- Server-side broker state is stored in Supabase with RLS enabled and deny-by-default policies; service-role access is backend-only.
- Client localStorage contains only trading-terminal UI state (settings/signals/trades/audit) and no password, Dhan credential or PII. It must not be expanded to hold credentials or identity data.

## 03 Pre-Deploy Production Audit
- Critical server configuration produces explicit configuration errors rather than silently operating without required secrets.
- Debug/test/backdoor endpoint names were searched for; none were found.
- Security headers include nosniff, DENY framing, HSTS in production, CSP, Referrer-Policy, Permissions-Policy, COOP and CORP.
- Generic 500 responses now carry an X-Correlation-ID while detailed errors stay server-side.
- TanStack Start CSRF middleware protects server functions against cross-site requests.
- Login attempts are limited to 5 per minute per source IP.
- No wildcard CORS configuration is present.
- Supabase persistence uses TLS-backed HTTPS APIs and deny-by-default RLS policies.
- GitHub CI runs security tests, source security audit, dependency audit, lint and build; Gitleaks is an additional secret scan.

## 04 Deep Security Audit for Complex Logic
Critical paths reviewed:
- authentication/session boundary
- Dhan credential boundary
- server-side risk gate
- durable order intent and idempotency
- Dhan order submission
- broker reconciliation
- order-state transitions
- postback verification
- input validation

Current protections:
- Live order execution is closed by default.
- UI state cannot override the server live gate.
- Risk is independently checked server-side.
- Duplicate order intents are blocked by idempotency key.
- Unknown/timeout order submission is reconciled rather than blindly retried.
- Terminal order states cannot be resurrected.
- Partial fills have explicit state handling.
- Dhan postbacks require the configured client ID and shared secret.
- Broker credentials remain server-side.

Remaining production gate:
- Configure a fixed/static egress IP and whitelist it with Dhan.
- Complete deployment-specific secret configuration.
- Run independent human security testing before real-money activation.

## 05 Attacker Perspective Review
Attack surfaces checked:
- ID-based data access: durable broker tables are not exposed through public client access; server functions require the app session.
- Login bypass: private broker/order functions use server-side auth middleware.
- Privilege escalation: there is no client-controlled admin role; live execution is controlled by server environment gates.
- Feature abuse: login is rate-limited; broker endpoints validate bounded inputs and Dhan rate-limit responses are handled.
- Injection: server functions validate network-bound inputs; no raw SQL query construction is used by the application persistence layer.
- Internal exposure: no /admin, /debug or /test backdoor route was found; secrets are not returned in errors.
- Business-logic manipulation: trade quantity/risk/position/session constraints are recomputed server-side before live execution.

## Important limitations
This is an automated/code-level review based on the supplied five-prompt guide. It is not a penetration test and does not prove production safety. The guide itself recommends a human security review for apps handling real money or sensitive data at scale.

## Live trading status
**LIVE TRADING REMAINS OFF.**
The security changes above harden the application; they do not activate real-money order placement.
