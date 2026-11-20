# Phase 1 — Dhan Trading Buddy Architecture Blueprint

**Status:** Design baseline proposed; no runtime implementation in this phase  
**Scope:** India/NSE cash-equity research and paper-trading system  
**Execution posture:** Paper-only. Live broker execution remains disabled.

## 1. Goals and non-goals

### Goals
- Keep one integrated CTS experience while separating workloads with different scaling, runtime, and reliability needs.
- Make Dhan the authoritative broker/market-feed adapter for India-specific live quotes and account data; use NSE official data sources for exchange-published reference data, bhavcopy, and announcements where available.
- Make every market datum traceable to its provider timestamp, ingestion timestamp, instrument identity, and quality status.
- Ensure deterministic calculations and a single server-side risk authority.
- Keep AI agents strictly advisory: they can explain and rank evidence, but cannot create an executable approval or bypass risk controls.
- Make scanning, research, paper orders, and backtests resumable and auditable.

### Non-goals
- No live order placement, no enabling of live flags, no production credential changes.
- No autonomous strategy deployment.
- No assumption that a strategy is profitable because it exists in a repository.
- No duplicate database or competing risk engine per service.

## 2. Target architecture

```text
                    ┌─────────────────────────────────────┐
                    │ CTS Web App — Control Plane         │
                    │ Auth • UI • Watchlist • Research    │
                    │ Paper Portfolio • Journal • Audit   │
                    └──────────────────┬──────────────────┘
                                       │ authenticated APIs
                    ┌──────────────────▼──────────────────┐
                    │ CTS Orchestrator / Policy Boundary  │
                    │ Job state • Contracts • Permissions │
                    └──────┬───────────┬───────────┬──────┘
                           │           │           │
             ┌─────────────▼──┐  ┌─────▼────────┐  ┌▼────────────────┐
             │ Market Data    │  │ Scan /       │  │ AI Research     │
             │ Adapter        │  │ Research     │  │ Service         │
             │ Dhan SDK       │  │ Worker       │  │ TradingAgents   │
             │ NSE MCP        │  │ deterministic│  │ Bull/Bear/news  │
             └──────┬─────────┘  └─────┬────────┘  └┬────────────────┘
                    │                 │             │
                    └─────────────────┼─────────────┘
                                      │ normalized evidence
                         ┌────────────▼─────────────┐
                         │ Supabase — System of     │
                         │ Record (single authority)│
                         │ jobs • snapshots • runs  │
                         │ paper orders • fills     │
                         │ risk decisions • audit   │
                         └────────────┬─────────────┘
                                      │
                         ┌────────────▼─────────────┐
                         │ Central Server Risk Gate │
                         │ Paper broker only        │
                         │ Live adapter hard-off    │
                         └──────────────────────────┘
```

The diagram is logical, not a claim that every box already exists as a deployed service.

## 3. Service ownership

| Component | Owns | Must not own |
|---|---|---|
| CTS web/control plane | Authentication, user experience, watchlists, research inbox, paper portfolio, journal, audit views | Raw provider scraping, duplicated indicator calculations, AI-controlled risk |
| Market data adapter | Dhan REST/WebSocket integration, instrument mapping, source timestamps, normalization, provider health | Trade selection, risk approval, order placement |
| NSE reference adapter | Exchange-published bhavcopy, market/reference data and announcements when available | Broker account state or intraday quote authority |
| Scan/research worker | Universe selection, staged deterministic screening, durable checkpoints and retries | User authentication, broker credentials, live orders |
| AI research service | News/fundamental context, Bull/Bear debate, cited rationale, structured research output | Authoritative prices, deterministic indicator values, risk approval, broker credentials |
| Backtest worker | Historical replay, cost model, metrics, validation artifacts | Live order access or production portfolio mutation |
| Central risk/paper execution | Risk decisions, paper order state machine, paper fills and reconciliation | AI-generated policy overrides |

**Deployment choice:** hybrid. Keep one CTS product and database. Split long-running ingestion, scanning, AI research, and backtesting into bounded workers/services only where needed. Do not create a microservice for every agent.

## 4. Source-of-truth rules

1. Dhan is the preferred source for broker-linked quotes, positions, orders, holdings, and account state.
2. NSE official sources are preferred for exchange-published bhavcopy, reference data, and corporate announcements.
3. A third-party source may add context, but must not silently overwrite a Dhan/NSE value.
4. Every observation records `source`, `source_timestamp`, `fetched_at`, and `data_status`.
5. A fetch timestamp is not a substitute for an exchange/provider event timestamp.
6. If the source timestamp is absent, materially stale, or unparseable, the value is `NOT_AVAILABLE` or `STALE`; never label it fresh merely because it was fetched recently.
7. Conflicts between sources are retained as separate observations and surfaced as a discrepancy; do not silently average them.

## 5. Canonical data flow

1. Sync and version the NSE instrument master. Store exchange, segment, instrument/security ID, symbol, series, lot size if relevant, tick size, and validity dates.
2. Ingest provider events/snapshots with provider event time and ingestion time.
3. Normalize into canonical OHLCV/quote records and validate symbol/security-ID mapping, session, timestamp, OHLC consistency, volume monotonicity where applicable, and duplicate events.
4. Publish a versioned market snapshot.
5. Run deterministic screening and strategy evaluation against a specific snapshot ID.
6. Persist each stage's input count, pass count, reject count, reason counts, and checkpoint.
7. Send only evidence bundles to AI researchers. AI output is commentary, not a replacement for raw evidence.
8. Store research result with source references and model/prompt version.
9. Human-reviewed candidates may enter the watchlist. A separate current intraday verification is required before a paper trade is considered.
10. The central server risk gate evaluates the proposed paper order using current portfolio and risk state.
11. Paper broker/order state machine persists intent, simulated fills, and journal events.

## 6. Canonical risk policy

The current project baseline is a ₹100,000 reference paper capital with:
- Maximum risk per trade: ₹500
- Maximum daily loss: ₹1,000
- Maximum weekly loss: ₹2,500
- Maximum 3 new trades per day
- Maximum 2 concurrent open positions
- Minimum planned reward/risk: 1.5
- Preferred reward/risk: 2.0; high-confidence research may target 2.5+
- NSE cash equities only; derivatives disabled

These are hard limits for the paper system baseline, not a promise of returns or a recommendation to trade. A policy change must be a reviewed server-side configuration/version change, never a UI or AI override.

**Authority:** server-side risk engine is the sole decision authority. Client-side checks are advisory UX only. Python workers must call the same versioned policy contract or a parity-tested implementation; they must not independently invent limits.

**Fail-closed rules:** missing portfolio state, stale quote, unknown order status, duplicate intent, missing stop, invalid quantity, or unavailable risk service means reject/hold the paper order. Never fall back to client approval.

## 7. Security and trust boundaries

- Dhan secrets and Supabase service-role credentials remain server-side only.
- AI services receive the minimum evidence needed and never receive broker credentials.
- Every service-to-service request is authenticated, scoped, and auditable.
- Validate all AI output against a strict schema; treat news, web pages, PDFs, and agent messages as untrusted data (prompt-injection boundary).
- No dynamic execution of user-supplied Python strategies in the main app process. Any future strategy sandbox must be isolated with resource/time/network restrictions.
- Webhooks require signature verification where supported, replay protection, and idempotent event handling. Avoid query-string secrets.
- RLS must be tested for owner isolation; service-role operations must be limited to server functions.
- Live execution stays hard-disabled in code and deployment configuration.

## 8. Operational requirements

- Durable job records, lease/heartbeat, bounded concurrency, retry with exponential backoff and jitter, dead-letter state, and resumable checkpoints.
- Provider rate limits and market-session-aware polling.
- Health/readiness endpoints report dependency status separately; a configured endpoint is not automatically healthy.
- Metrics: provider event age, fetch age, quote coverage, missing instruments, scan stage counts, queue age, job duration, retry count, AI latency/cost, paper-order transitions, reconciliation mismatches.
- Backups and restore tests for Supabase data and research artifacts.
- No long-running full-universe scan in a request/edge function with a small memory budget.

## 9. Existing modules to retain or adapt

| Existing code/repo | Phase 1 decision |
|---|---|
| CTS `src/lib/dhan.server.ts`, `market-data-engine.ts` | Retain as current integration baseline; extend source timestamps and quality semantics before relying on freshness |
| CTS `src/lib/scanner/*` | Retain deterministic scanner concepts; refactor to staged worker and auditable counts |
| CTS `src/lib/research/*` | Retain research-run/checkpoint/handoff patterns; align `OK/STALE/NOT_AVAILABLE` vocabulary |
| CTS `src/lib/trading/server-risk.ts` | Canonical risk authority candidate; consolidate policy and test client/server parity |
| CTS `order-state-machine.ts` and Supabase intent helpers | Retain for paper lifecycle; add failure/replay/reconciliation tests |
| `daily_stock_analysis` Dhan/NSE adapters and screening patterns | Selectively adapt; preserve MIT/Apache-2.0 notices and AlphaSift-derived attribution |
| `DhanHQ-py` | Use as SDK reference for a Python feed worker; pin a stable tested release/commit |
| `TradingAgents` | Use as research-only service; pin exact commit and align the user's fork with the service dependency |
| `TradingSpy-TradingAgentService`, `day-trader-skill` | Reuse workflow/backtest ideas only; US-centric assumptions must not leak into NSE logic |
| `freqtrade` | Do not copy code into CTS without explicit GPL-3 compatibility review |

## 10. Phase 1 decisions and open gates

**Decisions proposed**
- Hybrid deployment with CTS as control plane.
- Supabase remains the only system of record.
- Dhan/NSE source precedence and timestamp semantics as defined above.
- One central server-side risk policy.
- AI is research-only.
- Paper-only execution; live remains disabled.
- Versioned contracts in the companion API contract document.

**Must be confirmed before Phase 2 implementation**
- Exact Dhan API entitlements, static-IP requirements, WebSocket limits, and production account behavior.
- Which NSE MCP endpoints are currently available and their terms/operational limits.
- Supabase schema, RLS, migration and backup/restore state in the actual deployed project.
- Render/worker hosting constraints and budget; avoid depending on a free service for latency-sensitive continuous processing.
- Exact TradingAgents fork commit and dependency license/notice review.
- Whether current CTS app's active TanStack routes or legacy API routes are the supported integration surface; use only active authenticated routes.

## 11. Phase 1 exit criteria

- [x] Service ownership and hybrid architecture documented.
- [x] Source-of-truth and timestamp rules documented.
- [x] One risk authority and fail-closed policy defined.
- [x] Reuse/adaptation decisions documented.
- [x] Security boundaries and operational requirements documented.
- [x] Phase 2 dependency gates identified.
- [ ] API schemas reviewed against current database migrations and active routes.
- [ ] Owner approves Phase 2 implementation scope.

Phase 1 is complete as a design baseline. It does not mean the proposed architecture has been implemented or production-validated.
