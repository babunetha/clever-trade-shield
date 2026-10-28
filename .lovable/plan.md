# AI Market Researcher: what exists vs. what the brief needs

## Important first decision
The brief says AI Market Researcher should be a **separate app** and should not duplicate or break Clever Trade Shield (CTS). This project is CTS. Two options:
- **A.** Build Market Researcher as a new project. CTS keeps backtesting and paper trading, and the two connect through a documented, versioned handoff. This matches the brief.
- **B.** Grow CTS into Market Researcher. This is faster, but it goes against section 3 of the brief.

The plan below assumes **A**. Approving the plan means approving A. If you want B, say so and I'll update the plan.

## Already built (in CTS)
- Hard risk rules: ₹1,00,000 capital, ₹500 per trade, ₹1,000 per day, ₹2,500 per week, 3 trades a day, 2 open positions, 1.5R minimum, cash equities only, no F&O. These are enforced on the server, and live orders are blocked in code.
- Paper trading with explicit approval, duplicate-approval protection and re-checks when you confirm.
- Read-only Dhan connection, kept on the server: profile, funds, holdings, positions and latest prices (LTP), plus a connection test screen.
- Five scanners with second-stage checks, BUY CANDIDATE / WAIT / AVOID results, a stale-price block after 20 seconds and a quote-health panel.
- A simple simulated backtest panel, Pre-Market checklist, journal with AI coaching, AI evidence dialog (OpenAI) and a Bull/Bear/Risk/Validator committee (Gemini).
- Email login with an owner-only account, audit log, and 34 passing safety tests.

## Missing compared with the brief
1. **Real data.** Dhan secrets are still missing, so everything runs on simulated data. Not built yet: the Dhan instrument list (security IDs), historical and intraday candles, OHLC, index data and market depth.
2. **Data-quality engine (section 5).** Not built. It needs to check for bad OHLC values, duplicates, wrong order, gaps, time zones and source conflicts, with a separate freshness rule for each data type. It should also show `NOT_AVAILABLE` instead of a guessed value. Today only quote freshness is checked.
3. **Whole-market scanning (section 7).** The scanner covers about 50 symbols. The brief needs the full NSE list, with counts at each stage: found, valid, excluded (and why), evaluated and skipped.
4. **Market regime and morning briefing (section 6).** Missing: India VIX, breadth, FII/DII flows, INR/USD, Brent crude, US 10-year yield, GIFT NIFTY and sector strength. Also missing: the scheduled 8:30 AM IST briefing.
5. **Technical engine (section 8).** EMA 10/30, SMA 6/30, ATR, swing points, VCP, multi-timeframe checks, C1→C2→C3, liquidity sweeps, SMT, PSP, CISD, Fibonacci 38.2–61.8% and POC/VAH/VAL (only when volume-profile data exists).
6. **Fundamentals and news (section 9).** Missing: NSE/BSE announcements, results, corporate actions and shareholding. The news agent exists only in your GitHub repo, not in this app. This needs licensed or official data sources.
7. **Evidence-first setup card (section 11).** It needs the TRADE / WAIT / NO TRADE wording, source links and timestamps for each value, and "NO TRADE — INSUFFICIENT CONFIRMATION" when checks fail.
8. **Paper-trading upgrades (section 13).** Fees and slippage, reserved capital, pending entry triggers and exit reasons. Paper trades should also be saved in the database, not just in the browser.
9. **Backtest and validation (section 15).** Not built: replay on real history, strategy versions, costs, out-of-sample and walk-forward tests, look-ahead and same-candle checks, and breakdowns by regime and sector.
10. **Link to CTS (section 14).** A versioned handoff for evidence and strategy results. This does not exist yet.

## Build phases (in the new project)
1. **Foundation.** Owner login, database tables for instruments, candles, quotes and data-quality results, and the server-side Dhan connector with the instrument list and historical candles.
2. **Data-quality engine** and the source status screen.
3. **Whole-market scanner pipeline** with per-stage counts and the full technical engine.
4. **Market regime screen and morning briefing.** It runs on a schedule, and the schedule is shown as working only after a run has been verified.
5. **News and fundamentals** from licensed or official sources. Anything not available is marked `NOT_AVAILABLE`.
6. **AI research agents** (bull, bear, validator) and evidence-first setup cards.
7. **Paper trading in the database**, with fees and slippage, using the same deterministic risk engine.
8. **Real backtests** with out-of-sample and walk-forward tests, plus the versioned handoff to CTS.

Each phase ends with tests of the risk and data rules and a browser check.

## What you need to provide
- Dhan client ID and access token, added as backend secrets (never in chat), and a Dhan market-data plan.
- The news, fundamentals and macro data sources you have access to (or which ones you'll pay for).
- An OpenAI or Gemini key, if you want your own keys instead of built-in AI.

## Technical notes
- In the new project, reuse CTS's risk engine, safety-ceiling normalizer, quote-health checks and Dhan server module as copied, versioned modules. Don't share CTS's database.
- Store candles with both the source timestamp and the fetch time. Never treat a candle that hasn't closed yet as complete.
- The full-market scan runs as server batches within Dhan's rate limits, and results are saved to the database.
