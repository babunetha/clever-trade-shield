# NSE-first AI Day Trader: evidence-first gap audit and upgrade plan

## Decision and scope

Keep Clever Trade Shield as the foundation. Preserve its existing screens, scanners, journal, risk calculations, Dhan adapter and AI committee. Upgrade incrementally for **NSE cash equities, long-only, fully funded paper trading**, with separate intraday and swing workflows. No live-trading switch, F&O, leverage or short selling. Exclude Congress/Pelosi tracking.

Preserve ₹1,00,000 initial paper capital; ₹500 maximum risk/trade; ₹1,000 daily loss cap; ₹2,500 rolling seven-day loss cap; three entries/day; two simultaneous positions; minimum 1.5R; retain the existing two-loss lock. High-confidence plans should target at least 2.5R without inventing a reachable target. Treat limits as shared across intraday and swing, not separate allowances.

**Approval boundary:** approve only Phase 1 below. Phases 2–5 are the roadmap, not blanket permission to implement or purchase services. No application, database, account-setting or deployment changes are part of this audit.

## 1. Current architecture and module inventory

| Layer | Actual paths and responsibility |
|---|---|
| App and recovery | `src/router.tsx`, `src/start.ts`, `src/server.ts`, `src/routes/__root.tsx`; `src/components/LoadRecovery.tsx`, `src/lib/load-recovery.ts`, `src/lib/error-page.ts` |
| Authentication | `src/routes/login.tsx`, `src/routes/reset-password.tsx`, `src/routes/_authenticated/route.tsx`; `src/lib/auth-middleware.ts`, `src/lib/auth.functions.ts`; generated auth integration under `src/integrations/supabase/` |
| Existing UI | `src/components/trading/AppShell.tsx`; content screens in `src/routes/_authenticated/`: `index.tsx`, `market.tsx`, `scanner.tsx`, `researcher.tsx`, `signals.tsx`, `approvals.tsx`, `journal.tsx`, `risk.tsx`, `settings.tsx`, `checklist.tsx`, `agents.tsx`, `architecture.tsx` |
| Dhan and data | `src/lib/dhan.server.ts`, `src/lib/dhan.functions.ts`, `src/lib/market/instruments.ts`, `src/lib/market-data-engine.ts`, `src/lib/technical.functions.ts`, `src/lib/paper-market.functions.ts` |
| Scanners | `src/lib/scanner/definitions.ts`, `candidates.ts`, `live-candidates.server.ts`, `series.ts`, `verify.ts`, `quote-health.ts`; wrappers `src/lib/scanner.functions.ts`, `live-scan.functions.ts`, `live-signals.functions.ts` |
| Trading and risk | `src/lib/trading/store.tsx`, `types.ts`, `safe-settings.ts`, `risk-engine.ts`, `server-risk.ts`, `strategy.ts`, `indicators.ts`, `execution.ts`, `order-state-machine.ts`, `mock.ts` |
| Research and history tests | `src/lib/research/engine.ts`, `backtest.ts`, `report.ts`, `researcher.server.ts`, `researcher.functions.ts`; separate **simulated** scanner test at `src/lib/scanner/backtest.ts` and `src/components/trading/BacktestPanel.tsx` |
| AI | `src/lib/ai-agents.server.ts` / `.functions.ts` (Gemini committee); `src/lib/ai-gateway.server.ts`, `ai-analysis.functions.ts` (direct OpenAI evidence/coaching); confirmation-only AI under `src/lib/confirmation-ai/` and `confirmation-guidance.functions.ts` |
| Persistence | `src/lib/paper-storage.functions.ts`, `src/lib/supabase.server.ts`; applied migration lineage `drizzle/migrations/0000_*` through `0004_*` |
| Public interfaces | `src/routes/api/public/dhan/postback.ts`, `callback.ts`; `src/routes/mcp.ts`, `src/lib/mcp/` and OAuth consent/metadata routes. Callback is a 501 scaffold, not completed Dhan OAuth |
| Legacy / external | Root `api/`, `lib/`, `migrations/`, and `tradingagents-service/` are separate from the active TanStack paths. Python service has its own deployment; files do not establish an active CTS integration |
| Regression gates | Nine files under `tests/`; `.github/workflows/ci.yml` includes formatting, tests, safety checks, dependency audits and production build |

### Database actually inspected

Ten public tables exist with RLS enabled: `paper_trades`, `trade_audit`, `market_research_runs`, `user_roles`, `confirmation_ai_pause`, `order_intents`, `broker_orders`, `broker_trades`, `broker_postbacks`, `risk_events`. Owner SELECT policies protect journal/audit; research and confirmation rows additionally match the caller's user ID. Broker tables deny ordinary client access.

Latest read: **0 paper trades, 53 audit records, 1 research run**. The run is BLOCKED, cursor 0, ideas 0, with a stored Dhan 401/403 rejection. This proves a saved failure, not a successful candle research run. Broad table grants exist on several RLS-protected tables; grants alone do not bypass RLS. Journal/audit records are terminal-wide rather than per-user.

No scheduled jobs were returned by the schedule inventory. Repository SQL outside `drizzle/migrations/` is not proof that its proposed tables are deployed.

## 2. Gap matrix

**Tested** means the named local tests passed, not production readiness. **Partial** means meaningful code exists but the complete flow is not established. **Simulated** and **scaffolded** are deliberately separate from real integrations.

| Capability | State | Evidence and remaining gap |
|---|---|---|
| Scanner | Partial + simulated paths | Actual REST history/quote scanner exists; dashboard/ticker and scanner demonstration history remain simulated. Current live-data success unverified; attribution and source mixing need repair |
| News monitor | Missing | Research `news:null`; AI takes operator-written context. No active Dhan news adapter, ingestion, deduplication or verified materiality pipeline |
| Entry timer | Partial | ORB/above-VWAP/RVOL checks, signal expiry and session window exist. No complete reclaim/retest/timing state machine with evidence-linked invalidation |
| Exit planner | Partial | ATR stop, 1.5R first target and 2.5R second target. Paper exits use only target1 and optimistic stop fills; no swing/overnight gap policy or high-confidence 2.5R primary-plan rule |
| Time Machine simulations | Simulated + partial real-history engine | Scanner BacktestPanel uses generated history. Research backtest consumes supplied candles, next-bar entries, costs and OOS windows; two anti-look-ahead/OOS tests pass |
| Historical setup replay | Missing | No inspected date-selectable, bar-by-bar as-of replay preserving historical universe, announcements and strategy versions |
| Risk manager | Implemented/tested core; partial server authority | Cap/lock tests pass. Server intent validator checks per-trade risk but does not independently enforce portfolio loss/count/cash limits |
| Budget / sizing | Partial | Integer size from stop-distance risk and individual position capital; total invested cash across simultaneous positions is not correctly reserved |
| Paper broker / approval | Partial | Explicit approval/rejection, simulated adapter and journal exist. Browser mutation precedes durable save; deduplication is not atomic across tabs |
| Price alerts | Missing | Toasts and polling are not persisted crossing alerts; no alert subscriptions, delivery history or earnings alerts identified |
| Earnings / fundamentals | Missing; external scaffold | Research `fundamentals:null`; architecture labels and optional Python service do not prove verified coverage |
| Intraday | Partial | Existing momentum and ORB conditions reusable; true multi-timeframe/session semantics need corrections |
| Swing | Partial research; missing execution lifecycle | Daily history/backtesting exists, but profile forces `intradayOnly:true`; no persisted holding-horizon or swing-specific exits/statistics |
| Sector intelligence | Needs improvement | Verification borrows simulated peer changes; no genuine breadth/rotation/NIFTY comparison |
| Advanced structure | Missing | Research explicitly leaves volume profile, CISD, VCP, SMT/PSP unavailable; no completed POC/VAH/VAL, sweeps/displacement/Fibonacci pipeline established |
| AI research committee | Partial | Three independent Bull/Bear/Risk calls plus validator; not a complete rebuttal/evidence graph. No runtime-enforced evidence IDs or empirical confidence calibration |
| AI evaluation / cost control | Missing/partial | No outcome-linked accuracy/calibration or per-user trading-AI usage ledger/cache. Preserve existing providers/models; no AI per market tick |
| Freshness / provenance | Partial/tested validator | 20-second quote-age and OHLCV tests pass; receipt time is not exchange event time. Missing returned quotes are not fully reported |
| Journal / audit | Partial; durable rows observed | Tables/readback exist; swallowed save errors, client-authored fills and capped reads prevent a reliable authoritative ledger |
| Auth / recovery | Implemented boundary; partial reliability | Owner checks and bounded waits exist. Earlier signed-in dashboard opened; Researcher stayed on loading at the observation point. Password-reset page exists; email delivery and password update not verified |
| Automation | Missing backend scheduling | Foreground polling and manual three-symbol batches; no deployed schedule found, no unattended alert/paper/research worker |

### Dhan endpoint truth

Implemented adapters: GET `/v2/profile`, `/fundlimit`, `/holdings`, `/positions`, `/orders`, `/orders/external/{correlationId}`; POST `/marketfeed/quote`, `/marketfeed/ltp`, `/charts/intraday`, `/charts/historical`; instrument-master CSV resolver. Numeric-ID forwarding and error-806 handling have fixture tests.

**No fresh Dhan calls were made in this audit.** Previously reported account access is not today's entitlement proof. The saved research rejection confirms historical failure only; current quotes, candle coverage, token validity, corporate-action adjustment and historical depth remain unverified. Research requests approximately 520 calendar days and requires 220 completed daily bars—this is a requested window, not proven availability.

Requested POST `/v2/data/newsheadline` is not wired. Official endpoint contract, entitlement, rate limits and redistribution permission must be confirmed before integration; third-party documentation is insufficient.

## 3. Critical blockers and integrity findings

1. **P0: scope conflicts.** `types.ts:1`, `strategy.ts:39`, `mock.ts:186` allow/generate SHORT. `market/instruments.ts:90–99` resolves the first matching NSE/BSE row without NSE preference. `safe-settings.ts:21` forces intraday only. These conflict with the new NSE long-only, intraday-plus-swing requirement.
2. **P0: unreliable paper authority.** `store.tsx:340–353,519–529` reports local success and ignores failed saves; `paper-storage.functions.ts:5–33` accepts client-authored trades rather than revalidating authoritative plans. Zero deployed paper rows means a complete durable ticket flow has not been established.
3. **P0: cash and risk consistency.** `risk-engine.ts:130` compares one position against starting capital, not available cash after other positions. `scanner/verify.ts:95` subtracts open *risk*, not invested capital. `server-risk.ts:65–139` does not recompute daily/weekly counts/losses from durable positions; environment limits are not safety-ceiling-normalized.
4. **P0: reset can temporarily bypass history.** `store.tsx:582–587` clears local trades including open positions; it must not reset durable loss limits or hide open positions. History must remain intact.
5. **P0: evidence contamination.** `scanner.tsx:225–242` combines live ticks with simulated index/sector context. `technical.functions.ts:20–25,47–54` ends requests at today's 09:15; `indicators.ts:66–75,153–154` computes cross-session VWAP and labels one series as both 5m and 15m.
6. **P1: execution realism and recovery.** `store.tsx:250–265` fills exact stops/targets on crossings, losing gap/slippage realism; browser closure stops marking. Research claims in `researcher.functions.ts:38–74` have no expiring lease for process interruption.
7. **P1: replay attribution.** Live scanner unconditionally drops the last daily bar and assigns all matches one scanner ID; OOS accepts overlapping step/test windows. No point-in-time universe prevents claiming survivorship-bias control.
8. **Paper-only boundary:** `dhan-live-execution.server.ts:43–57` unconditionally blocks placement; tests confirm flags alone cannot enable it. However, `dhan.functions.ts:309–325` can reach broker cancellation for an attached order. Paper-only must block all broker-changing paths, not just placements.

### Security assurance limits

Existing scan results show no findings in older database, dependency and MCP scans, all marked outdated; **no recent deep-security scan was returned**. Run one from the Security tab before claiming security assurance. Owner authorization exists, but that is not a full security certification. First-owner bootstrap, public postback authentication, privileged storage boundaries and strict network-input validation need scoped review. Do not change signup, verification or privileges during this audit.

### Verification record

Earlier in this audit, `bun test tests` returned **51 pass, 0 fail, 99 assertions**. The latest available build log says build OK on 9 November; no new build was run. The combined lint/safety invocation did not yield retrievable completion results, so they are **not newly verified**. Fresh provider success, live news, background workers and authenticated paper save/readback remain unverified. The Day Trader skill body was unavailable; the comparison uses the capability list you supplied, not a claimed skill execution.

## 4. Target architecture: reuse, not parallel replacements

```text
Existing Dhan adapter + verified future sources
  -> timestamped, NSE-resolved quality evidence
  -> existing scanners / researcher / committee
  -> versioned intraday-or-swing plan
  -> existing deterministic risk engine, server-authoritative ledger
  -> manual approval -> paper fill only
  -> existing journal + alerts + replay + outcome evaluation
```

Keep the current TanStack server boundaries, owner checks, UI components and trading providers. Consolidate existing storage access rather than adding another journal or broker. Plans carry exchange, side, horizon, strategy/version, evidence IDs, entry condition, expiry, stop, targets, quantity, reserved cash and risk. Every missing source stays unavailable; sentiment never authorizes a trade.

## 5. Phased upgrades and acceptance gates

### Phase 1 — Paper safety and durable authority (execute next)

**Exact scope:** enforce NSE long-only paper policy at generation, approval and persistence boundaries; leave broker-changing operations unreachable; preserve numeric limits and existing UI. Reuse `risk-engine.ts`, `safe-settings.ts`, `paper-storage.functions.ts`, `supabase.server.ts` and journal tables. Make paper approval atomic and idempotent against durable cash, positions and loss/count limits. Show pending/saved/failed states instead of silent success; make retry safe. Prevent reset from erasing risk history/open positions. Persist optional workflow metadata additively, but do not enable swing approvals yet. Guard mixed simulated/live evidence at approval; missing real context fails closed.

**Tests:** reject SHORT/BSE/F&O/leverage and every broker mutation; ₹100,000 starting cash, ₹500 risk, ₹1,000 daily, ₹2,500 rolling-seven-day, third-entry ceiling, two-position ceiling, 1.5R minimum and two-loss lock; combined position cash cannot exceed available funds. Concurrent approvals create one ticket; failed save creates no committed position; safe retry creates one; reload/new session reads the same ticket; reset does not release limits. Preserve existing regression tests and screen layout.

**Dependencies:** approval of Phase 1; review additive ledger constraints/transaction needs and RLS before any migration. Never create duplicate trading tables or modify old user records destructively. Fresh security review is a release gate. No Dhan entitlement or AI call is required for deterministic safety tests.

### Phase 2 — Real-data correctness and research recovery

Correct source/event/receive timestamps, five quality statuses, missing coverage, NSE calendar, genuine 5m/15m bars and session VWAP; retain matched strategy IDs; recover research leases. Add intraday/swing planning and high-confidence 2.5R targeting with documented scoring, achievable evidence-backed targets and shared budgets.

**Acceptance:** no simulated input passes as live; partial/future/stale bars block; independent timeframe/session fixtures pass; interrupted batch resumes once; swing positions survive overnight with cash reserved; 2.5R policy cannot be met by invented targets. **Dependency:** successful read-only Dhan quote/history checks and verified coverage.

### Phase 3 — News, fundamentals and alerts

Extend existing data/AI modules with original-news storage separate from interpretations, deduplication, entities, materiality/credibility/freshness and measured price/volume reaction. Add earnings context and persisted price/entry/exit alerts inside existing workflows, not a second pipeline.

**Acceptance:** source IDs/timestamps retained; duplicate articles/crossings cause one event; denial/outage cannot fabricate news; sentiment alone never approves; verify delayed/offline alert behavior. **Dependencies:** documented official APIs, authentication, rate limits, costs/licensing and redistribution rights; scheduling/delivery approval.

### Phase 4 — Time Machine and strategy evaluation

Extend `research/backtest.ts` with date/bar replay, frozen strategy versions, non-overlapping OOS, realistic NSE charges/gaps, corporate actions and point-in-time universes. Keep simulated demonstrations explicitly separate. Split intraday/swing statistics in the same journal.

**Acceptance:** replay cannot see later bars/news; fixtures reconcile fees/cash/risk; overlapping test periods rejected/deduplicated; unavailable universe/action data marks limitations; never fabricate performance. **Dependency:** licensed historical candles and historical metadata/news.

### Phase 5 — Evidence-led agents and operations

Extend the current Bull/Bear/Risk/validator with structured evidence references, contradiction handling, manager synthesis and outcome-linked calibration. Add durable leases, monitored jobs, bounded provider recovery, caching and token/cost budgets—no per-tick AI. Advanced sectors/structure follow verified coverage.

**Acceptance:** unsupported evidence IDs rejected; confidence separated from calibrated probability; paused/denied work is not retried automatically; cached results match evidence/strategy/model versions; usage totals reconcile. **Dependency:** observed outcomes, provider access, source rights and separately approved operating budgets.

## 6. Cost and remaining limitations

No defensible monthly total is available. Estimate from measured news items, research runs, four committee calls/run, input/output tokens, retained candles, job frequency and delivery volume. Existing direct OpenAI/Gemini trading costs remain separate from confirmation-only gateway credits. Dhan personal data access is not commercial redistribution permission. Official exchange corporate-data products may require paid agreements; RBI/MOSPI, flows, global indices, USD/INR, Brent and yields need individual contract/coverage reviews before promises or connections.

**Next action after approval: Phase 1 only, starting with failing safety/durability regression tests, then minimal changes to existing boundaries and ledger.** No live execution or live switch at any phase.