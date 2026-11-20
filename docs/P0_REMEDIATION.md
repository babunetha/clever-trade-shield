# P0 remediation — Dhan quote freshness and server-side paper approval

**Branch:** `fix/p0-data-freshness-server-paper-risk`  
**Scope:** Paper simulation and read-only Dhan data only. Live broker execution remains hard-disabled.

## 1. Dhan quote source time

- `getDhanQuote` parses the Dhan `last_trade_time` field.
- Dhan's `DD/MM/YYYY HH:mm:ss` values are interpreted in Asia/Kolkata time and normalized to ISO UTC.
- A provider timestamp is kept separately from the request's `fetchedAt`.
- Scanner candidate verification uses the provider timestamp, not the fetch timestamp.
- A missing, invalid, future, or older-than-20-second source timestamp fails closed.
- The paper-position mark poller also ignores stale/missing source timestamps before changing marks or simulating exits.

## 2. Server-authoritative paper approvals

New OPEN paper trades are created only through the authenticated `approvePaperTrade` server function and the atomic `public.approve_paper_trade` Postgres function.

The server:

- Re-resolves the NSE symbol/security-ID pair for Dhan-sourced approvals.
- Re-fetches the full Dhan quote and checks its source timestamp.
- Uses the re-fetched Dhan price as the approved entry for Dhan-sourced trades.
- Recalculates stop distance, rupee risk and reward/risk.
- Persists the approved trade in the same database transaction that checks portfolio limits.
- Uses an advisory transaction lock and a unique approval ID to prevent duplicate/concurrent approvals.

The database enforces the paper profile:

- ₹500 maximum planned risk per trade
- ₹1,000 daily realized-loss plus reserved open-risk budget
- ₹2,500 rolling seven-day realized-loss limit
- Maximum 3 entries per NSE day
- Maximum 2 open positions
- Minimum 1.5R
- ₹100,000 total notional paper exposure
- NSE session 09:20–15:10 IST
- Approval lock after 2 losing paper trades in the NSE day

The environment variable `CTS_PAPER_APPROVALS_ENABLED=false` disables all new paper approvals. It is optional and defaults to enabled when unset.

The generic paper-record update function cannot create a new OPEN trade. It only permits notes changes to existing records and server-recalculates P&L when an existing open trade is closed. Closed records cannot be reopened or have their risk identity changed.

## 3. Required database step

Apply this migration to the CTS Supabase project before testing paper approvals:

`supabase/migrations/20261120170000_server_authoritative_paper_approval.sql`

If the migration is not applied, the approval RPC will fail and the UI will not create a new paper trade. This is intentional fail-closed behavior.

## 4. Validation commands

From the repository root:

```powershell
bun test tests/quote-health.test.ts
bun run build
```

The timestamp unit tests cover:

- Dhan local-time conversion to UTC
- The 1980 sentinel timestamp remaining stale
- Missing source timestamps
- Invalid/future timestamps
- The 20-second freshness boundary

## 5. Not verified in this change

- The migration has not been applied to the user's production Supabase project.
- Dhan credentials and the user's live quote payload have not been tested.
- Bun tests and the production build have not been executed in this environment.
- No deployment, credentials, or live execution setting has been changed.

**No real broker orders are placed by this remediation.**
