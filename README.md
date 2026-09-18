# Dhan Trading Buddy

Build a full-stack web app called “₹1L Trading Assistant” for my Dhan-based trading workflow. This is a risk-controlled signal and manual-approval dashboard, NOT an unrestricted auto-trading bot. Starting capital ₹1,00,000; max risk/trade ₹500; max daily loss ₹1,000; max 3 trades/day; lock after 2 losing trades or ₹1,000 daily loss; equity intraday only, no F&O/options by default. Include Dashboard, Market Overview, Signals, Trade Approval, Trade Journal, Risk Controls, and Settings. Signal fields: EMA 9/20/50/200, RSI 14, MACD, VWAP, ADX, volume/relative volume, support/resistance, 5m/15m context, Nifty/Bank Nifty bias. Approval mode must show entry/SL/T1/T2/quantity/risk/R:R and require explicit APPROVE/REJECT, but this first version must NOT place live orders. Use mock/simulated market data clearly labeled. Prepare server-side-only Dhan integration interfaces and a future OAuth callback placeholder; never expose/store API secrets or access tokens in the browser. Keep live execution behind a disabled feature flag. Professional dark trading-terminal UI, responsive, INR formatting, audit logs, validation, safe risk controls, emergency disable trading, and educational disclaimer. Do not ask for credentials in chat.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://clever-trade-shield.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/85ae5811-3ce6-443a-a21e-f4cfce9cd6af).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
