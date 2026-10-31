# Where things stand

## Built in this app (Clever Trade Shield)
- Safety layer: ₹1,00,000 capital, ₹500 risk per trade, ₹1,000 daily and ₹2,500 weekly loss caps, 3 trades a day, 2 open positions, lock after 2 losses. Live orders are blocked in code.
- Screens: Dashboard, Market, Signals, Trade Approval, Journal, Risk, Settings, Scanner (5 scanners), Pre-Market Checklist, AI Agents, Architecture.
- Paper trading only, with your explicit approval, fresh prices (under 20 seconds) and a risk check when you confirm.
- Dhan connection (read only): profile, funds, holdings, positions, live prices. Your keys stay on the server.
- AI: Gemini committee, OpenAI evidence check and journal coach.
- Email/password sign-in. The first account becomes the owner.
- A draft format for sharing stock ideas with a future "AI Market Researcher" app.

## Not built yet
1. The AI Market Researcher. It's meant to be a separate project, so you'd create it and start it there.
2. Saving trades and audit logs to the database, so they're still there after a reload or on another device.
3. Reading research ideas from the Researcher into the Scanner, using the shared format.
4. A streaming price feed that runs on the server, instead of refreshing every 10 seconds.

## Needs you
- Dhan client ID and access token added as backend secrets, plus Dhan's market-data plan.
- An OpenAI or Gemini key, added the same way.

## Proposed next step
Do item 2 in this app: save paper trades, the journal and audit logs to the database, with each saved record visible only to the owner. Live orders stay off.
