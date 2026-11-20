# CTS / Dhan Trading Buddy — Code Gap Audit

**Audit date:** 20 November 2026  
**Repository reviewed:** `babunetha/clever-trade-shield` default branch at the audit snapshot  
**Method:** Read-only GitHub source inspection and cross-file tracing. No runtime credentials, production database, Dhan account, deployed Render service, or private production logs were accessed. No application code was changed as part of this audit.  
**Important:** Findings below are code-level observations, not a claim that the production deployment has been tested.

## Executive summary

CTS has a useful foundation: authenticated server functions, server-only Dhan credentials, a hard-disabled live execution adapter, an existing paper-trade journal, a scanner, historical research, a backtest foundation, a risk state machine, and CI tests.

It is not yet a reliable end-to-end Dhan research and paper-trading system. The highest-priority gaps are:
1. Quote freshness is measured from fetch time, not source/event time.
2. Paper-trade risk approval is client-side; the server persistence endpoint does not recompute or enforce it.
3. The risk calculations do not consistently apply the proposed open-risk/unrealized-loss policy.
4. The TradingAgents service is not connected to the active TanStack app path and uses third-party data vendors by default.
5. Dhan WebSocket streaming, full-universe background scanning, automated news/fundamental/macro evidence, and intraday backtesting are not delivered.
6. Several documented service/version and contract descriptions are out of sync.

**Safety status:** The inspected live Dhan adapter has an unconditional hard-disabled reason in its gate, and the current paper approval path logs simulated records rather than transmitting broker orders. Keep that boundary in place.

## Findings by priority

### P0 — Fix before trusting any scanner freshness result

#### F-01. Dhan quote freshness can be falsely positive

**Evidence**
- `src/lib/dhan.server.ts`: `DhanQuote` contains price/OHLC/volume/average price/net change, but no source trade/event timestamp is parsed.
- `src/lib/scanner.functions.ts`: successful Dhan LTP response is labelled with `asOf: new Date().toISOString()` after the request.
- `src/lib/market-data-engine.ts`: snapshot `asOf` is generated at fetch time.
- `src/lib/scanner/quote-health.ts`: 20-second freshness is calculated from the supplied `asOf`.
- `src/routes/_authenticated/scanner.tsx`: the scanner passes that fetch timestamp to quote health and paper approval.

**Impact**
A quote that is old at the provider can be fetched again and appear less than 20 seconds old. Current tests prove only that the supplied timestamp is within 20 seconds; they do not prove the source quote itself is recent.

**Required correction**
- Parse the Dhan source event/last-trade timestamp when the endpoint provides it.
- Store both `source_timestamp` and `fetched_at` separately.
- Compute age from the source timestamp.
- If the source timestamp is unavailable or invalid, show `NOT_AVAILABLE` and block any freshness-gated decision.
- Add tests for old-source/recent-fetch, absent source timestamp, future timestamp, and timezone handling.

### P0 — Make paper risk approval authoritative on the server

#### F-02. Paper-trade approval is client-side; server persistence trusts the payload

**Evidence**
- `src/lib/trading/store.tsx`: `openPaperTrade` performs validation in the React store and then calls `persistPaperTrade`.
- `src/lib/paper-storage.functions.ts`: authenticated `persistPaperTrade` validates basic field shapes, then writes the supplied payload through the service-role Supabase helper. It does not recompute stop risk, reward/risk, daily/weekly loss, trade count, position count, quote freshness, or candidate eligibility.
- `src/lib/trading/store.tsx`: paper state is also held in browser state/localStorage and merged with remote records.

**Impact**
Browser-side checks are useful UX but are not an authoritative risk boundary. A modified client can submit a paper record that bypasses the UI validation. This does not currently place a Dhan order, but it can corrupt the journal, risk calculations, and paper performance statistics.

**Required correction**
- Create a server-side `approvePaperTrade` operation that loads the durable owner portfolio and candidate snapshot itself.
- Recompute quantity, risk, R:R, open positions, daily/weekly limits and candidate freshness on the server.
- Use an atomic database transaction/unique approval key so concurrent requests cannot both pass based on the same old state.
- Persist the decision and trade together; return the authoritative stored record.
- Treat browser risk checks as preview only.

### P1 — Align the risk policy and its implementation

#### F-03. Current risk engine does not fully implement the proposed open-risk loss policy

**Evidence**
- `src/lib/trading/risk-engine.ts`: daily and weekly lock checks use realized P&L. Open stop-risk is subtracted from the remaining daily risk budget, but open unrealized P&L is not included in the loss-limit checks.
- `src/lib/trading/server-risk.ts`: `ServerRiskPolicy` declares daily loss, weekly loss, max trades and max open positions, but `validateServerOrderIntent` has no portfolio/ledger input and checks none of those aggregate limits. It validates individual intent/session fields only.
- `src/lib/dhan.functions.ts`: `submitApprovedTrade` calls that validator for its shadow approval.

**Impact**
The UI and server-side shadow intent checks do not represent one canonical, portfolio-aware policy. The documented proposal to include remaining open risk in daily/weekly entry gating is not implemented consistently.

**Required correction**
- Define the loss accounting convention explicitly: realized P&L plus mark-to-market unrealized P&L, plus reserved worst-case open risk for new-entry checks (avoid double-counting).
- Define the daily reset and rolling/seven-day boundary using Asia/Kolkata trading dates.
- Load portfolio/ledger state inside the server transaction; never accept aggregate risk numbers from the browser.
- Consolidate duplicate client/server policy logic around one versioned server policy and parity tests.
- Retain the existing ₹500/trade, ₹1,000/day, ₹2,500/7-day, max 3 entries/day, max 2 open positions, minimum 1.5R baseline for paper validation.

#### F-04. Server shadow approval trusts client-supplied reward/risk

**Evidence**
- `src/lib/trading/server-risk.ts`: `ServerOrderIntent` has `riskReward`, but no target price. The validator checks the supplied R:R number rather than deriving it from entry, stop and target.
- `src/lib/dhan.functions.ts`: `submitApprovedTrade` forwards the caller's `riskReward` value.

**Impact**
A caller can submit an overstated R:R value to the shadow approval endpoint. The current hard-disabled live gate prevents transmission, but this is not a safe foundation for a future execution path.

**Required correction**
Include target in the intent and derive net reward/risk server-side from validated entry, stop, target, costs and slippage. Never trust caller-computed R:R.

#### F-05. Paper position marking and exits are browser-timer dependent

**Evidence**
- `src/lib/trading/store.tsx`: open paper positions are marked by a browser-side 3-second timer calling Dhan mark quotes; stop/target closure is applied through client state.
- The paper close/fill model uses the stop or target price directly when crossed.

**Impact**
A closed browser, sleeping computer, missed poll, unavailable quote or gap through a stop can produce unrealistic paper fills and inconsistent P&L. The app is not a server-authoritative paper simulator yet.

**Required correction**
Move paper mark/fill evaluation to a durable worker or server job. Record the source observation, timestamp, fill model, slippage and costs. If a quote is missing/stale, leave the position unmarked and flag it; do not invent a fill. Model gap-through-stop behavior conservatively.

### P1 — Connect the intended research architecture

#### F-06. TradingAgents service is not wired into the active app route

**Evidence**
- Active scanner route imports `runAiTradingAgents` from `src/lib/ai-agents.functions.ts`.
- That function calls the in-app Gemini committee in `src/lib/ai-agents.server.ts`.
- `TRADINGAGENTS_SERVICE_URL` references found in the repository are in legacy `api/` files, deployment/config documentation, and the separate service README. No active TanStack server function was found that calls the external `/analyze` endpoint.
- `hatchable.toml` defaults `tradingagents_enabled` to false.

**Impact**
Deploying the Render TradingAgents service alone will not make the active CTS scanner use it.

**Required correction**
Add an authenticated active TanStack research endpoint, service timeout/retry/cost limits, strict response schema validation, provenance and audit storage. Keep it advisory-only and do not let its verdict create a paper order.

#### F-07. TradingAgents vendor defaults can diverge from Dhan/NSE data

**Evidence**
- `tradingagents-service/app.py`: defaults core prices, technical indicators, fundamentals and news vendors to `yfinance`.
- The service accepts supplied Dhan/NSE context, but other vendors remain configured and may produce conflicting market facts.
- `tradingagents-service/requirements.txt` pins upstream `v0.5.1`, while `tradingagents-service/README.md` and `hatchable.toml` describe `v0.5.0`.

**Impact**
Research can mix third-party prices with the CTS Dhan snapshot; version drift also makes behavior harder to reproduce.

**Required correction**
Pin one exact tested commit/tag and update all documentation/config. Make Dhan/NSE snapshot authoritative for current prices and technical values. Mark external data as contextual only, preserve source timestamps, and explicitly flag conflicts. Verify actual TradingAgents resolver/API behavior in a test environment before enabling it.

#### F-08. TradingAgents context handling needs an integration test

**Evidence**
- `tradingagents-service/app.py` monkey-patches `graph.resolve_instrument_context` and injects request context into the analyst context string.
- The service truncates serialized context at 24,000 characters, potentially cutting JSON mid-value.
- The current code reports `contextAccepted: true` when any context is supplied; this does not prove the analysts actually used every required field.

**Required correction**
Use a structured, bounded context schema; reject oversized payloads instead of truncating JSON; test that the intended analysts receive the exact source timestamp and evidence references. Return explicit consumed/ignored field lists.

### P1 — Data and backtest completeness

#### F-09. WebSocket streaming and automated full-universe scanning are not implemented

**Evidence**
- `docs/FINAL_STATUS.md`: active scanner uses candidate-only foreground HTTP polling; WebSocket streaming is not implemented.
- `roadmap.md`: Researcher processes three instruments per explicit batch; automatic full-universe background scanning is listed as not delivered.
- The instrument master previously observed around 10,066 NSE equity rows before eligibility/liquidity filtering; this is not the same as a completed scan of all eligible instruments.

**Required correction**
Add a bounded, resumable background worker with durable checkpoints, instrument eligibility rules, rate limits, retries, queue visibility, and per-stage counts. Add a secure server-side Dhan streaming relay only after validating current Dhan entitlements and WebSocket limits. Do not run a full-universe scan in a browser request or memory-limited edge function.

#### F-10. Macro, news and fundamentals are placeholders, not a live evidence pipeline

**Evidence**
- `src/lib/research/engine.ts`: news, fundamentals, market regime, volume profile, SMT, PSP, CISD and VCP fields are null placeholders.
- `src/routes/_authenticated/researcher.tsx`: UI states India VIX/breadth/flows/global macro and official news/fundamentals are NOT_AVAILABLE because sources are not connected.
- `docs/FINAL_STATUS.md`: news pasted into evidence analysis is operator-supplied; no automatic live news feed.

**Required correction**
Connect documented sources, record article/filing publication time and retrieval time, attach citations/IDs to claims, deduplicate stories, and use NOT_AVAILABLE/STALE where data is missing. Never synthesize missing data.

#### F-11. Existing backtest is not an intraday execution simulator

**Evidence**
- `src/lib/research/backtest.ts` and `roadmap.md`: existing work is daily-bar trend breakout/walk-forward; intraday strategy backtesting remains undelivered.

**Required correction**
Build event-driven intraday replay with point-in-time candles/quotes, no-lookahead tests, conservative intrabar ordering, gaps, market sessions/halts, realistic Indian brokerage/STT/exchange/GST/SEBI costs, slippage, and out-of-sample/walk-forward results. Include data coverage and strategy version in every report.

### P2 — Reliability, contracts and security hardening

#### F-12. Dhan postback secret is in the URL query string

**Evidence**
- `src/lib/dhan-postback.server.ts`: `verifyPostbackRequest` reads `token` from the request URL query string; the body parameter is not used for authentication.
- `src/routes/api/public/dhan/postback.ts`: the URL and raw body are passed to this verifier.

**Impact**
Query-string credentials can leak through reverse-proxy/access logs, monitoring, or URL capture. Whether Dhan supports a signed header/body alternative must be confirmed against its current webhook contract.

**Required correction**
Prefer a provider-supported signature/header mechanism. If the provider only supports a URL token, use a high-entropy dedicated secret, prevent URL logging, restrict endpoint exposure where possible, rotate it, and add replay/timestamp protection if supported. Validate the exact provider webhook format with a captured test event.

#### F-13. Unknown current order status is accepted as a new state

**Evidence**
- `src/lib/trading/order-state-machine.ts`: `transitionOrderStatus` returns `next` when `current` is not a known status.

**Impact**
A corrupted or unexpected persisted status bypasses the transition graph instead of forcing reconciliation.

**Required correction**
Unknown persisted status should raise a typed error or move to a dedicated quarantine/reconciliation path. Do not silently accept the transition.

#### F-14. API contracts and repository docs have schema drift

**Evidence**
- `docs/RESEARCHER_HANDOFF.md` documents a handoff schema using `schema`, `generated_at`, `verdict`, `source_ts`, and statuses `OK | STALE | NOT_AVAILABLE`.
- `src/lib/research/engine.ts` currently uses `schema`, `generated_at`, `verdict`, `source_ts`, but evidence status type only includes `OK | NOT_AVAILABLE`; it does not emit `STALE`.
- Phase 1 contract document proposes a normalized `schema_version` and different field names. Existing consumers must be migrated deliberately.
- `README.md` for TradingAgents describes v0.5.0; requirements pin v0.5.1.

**Required correction**
Publish explicit compatibility adapters or version bump. Generate runtime validators and test fixtures from the same schemas. Do not silently rename existing fields.

#### F-15. Correlation ID is derived from a truncated idempotency key

**Evidence**
- `src/lib/dhan.functions.ts`: correlation ID is derived from the first 25 allowed characters of the caller's idempotency key.
- Migration makes `broker_correlation_id` unique.

**Impact**
Different idempotency keys sharing the same normalized prefix can collide. Live gate is currently hard-disabled, but the design should be corrected before any live path is considered.

**Required correction**
Generate a server-side random correlation ID per durable intent, store it once, and enforce a database uniqueness constraint. Do not derive it from a user-controlled truncated prefix.

#### F-16. `persistPaperTrade` accepts caller-supplied IDs and payloads

**Evidence**
- `src/lib/paper-storage.functions.ts`: the authenticated handler forwards caller-supplied `id`, symbol, timestamps and JSON payload to the service-role upsert helper.
- The table is protected from direct anon/authenticated access, but the server function itself does not verify payload integrity or ownership metadata.

**Required correction**
Only allow writes through server-approved trade lifecycle functions. Validate fields, enforce unique approval IDs, derive timestamps/status on the server, and include owner identity if the product is ever expanded beyond the single-owner deployment.

## Contract alignment checklist from Phase 1

| Phase 1 item | Audit result |
|---|---|
| Service ownership documented | Done in Phase 1 design doc |
| Source timestamp/fetch timestamp semantics | Specified, but current quote code does not implement them |
| Single server risk authority | Not implemented for paper approval; client remains authoritative in active UI path |
| AI research-only boundary | Current Gemini committee is advisory; external TradingAgents integration is not active |
| Versioned market/research contracts | Proposed; existing implementation and docs still have schema drift |
| Durable/resumable full-universe scan | Not delivered |
| Intraday backtest | Not delivered |
| RLS/migrations deployed and tested | Source migration reviewed; actual deployed schema/RLS not verified |
| Dhan credentials/entitlements and quote/reconnect | Not verified against live account |
| CI latest commit | Not run as part of this read-only audit |

## Recommended remediation order

### Gate 1 — Data trust and risk correctness
1. Fix source timestamp capture and freshness semantics (F-01).
2. Move paper approval and risk computation server-side, with atomic ledger updates (F-02, F-03).
3. Recompute R:R server-side from target and cost model (F-04).
4. Move paper mark/fill evaluation out of browser timers (F-05).
5. Harden state machine and correlation ID (F-13, F-15).

### Gate 2 — Real research integration
6. Wire TradingAgents to active authenticated routes and pin one exact version (F-06, F-07, F-08).
7. Add official news/fundamental/macro source adapters and evidence provenance (F-10).
8. Implement background scanner and WebSocket relay only after Dhan data access is verified (F-09).

### Gate 3 — Validation and operations
9. Add intraday event-driven backtesting and point-in-time validation (F-11).
10. Review postback authentication and replay protection (F-12).
11. Reconcile schemas, migrations, RLS, backup/restore, monitoring and deployment (F-14, F-16 plus external verification).

## Tests required before calling CTS reliable

- Source timestamp old but fetched now => STALE.
- Missing source timestamp => NOT_AVAILABLE and blocked.
- Concurrent identical paper approvals => exactly one trade.
- Forged browser payload cannot bypass server risk.
- Open-risk/unrealized-loss boundaries enforced at daily and rolling weekly limits.
- R:R recomputed from target and costs; forged caller R:R ignored.
- Stale/unknown candidate cannot be paper approved.
- Browser closed for several minutes does not stop server paper fills.
- Gap through stop is simulated conservatively with explicit slippage.
- AI cannot alter price, indicator, risk policy, or execution state.
- External TradingAgents service is actually invoked from active authenticated route and response provenance is recorded.
- Full-universe scan reports accurate eligible/processed/missing counts and resumes after worker crash.
- Unknown order status enters reconciliation/quarantine.
- Postback duplicate/replay and wrong client/secret are rejected.
- All migrations apply to a clean test Supabase project; RLS/owner access tests pass.
- CI runs typecheck, lint, unit, integration, security and build against the exact reviewed commit.

## Explicitly unverified external conditions

- Real Dhan API data entitlement and access-token validity.
- Dhan quote event timestamp fields as returned by the user's active subscription.
- Dhan WebSocket subscription limits, reconnect behavior and current API terms.
- Deployed Supabase migrations, RLS and service-role secret correctness.
- Render deployment health, cold-start behavior and service token configuration.
- Real OpenAI/Gemini/TradingAgents provider responses, costs and timeouts.
- Backup restoration and production monitoring.

**Conclusion:** Phase 1's architecture and contract documents are a design baseline. The code audit found that important parts of that baseline are not yet implemented. The immediate priority is not adding more indicators or agents; it is making market-data freshness, server-side paper risk approval, and paper execution records trustworthy.
