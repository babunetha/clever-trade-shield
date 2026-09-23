# PC Installation — Clever Trade Shield

## 1. Install prerequisites (Windows)

Install:
- Git
- Bun (recommended)
- Node.js 22+ only if a dependency requires it

Then open PowerShell and verify:

```powershell
git --version
bun --version
```

## 2. Clone the project

```powershell
git clone https://github.com/babunetha/clever-trade-shield.git
cd clever-trade-shield
```

## 3. Install dependencies

```powershell
bun install
```

## 4. Configure local secrets

Copy `.env.example` to `.env.local` and fill only the server-side credentials you actually have.

Never put Dhan, Gemini, Supabase service-role, or other private API keys in `VITE_*` or `PUBLIC_*` variables.

Start with:
- `GEMINI_API_KEY`
- `DHAN_CLIENT_ID`
- `DHAN_ACCESS_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_SESSION_SECRET`
- `APP_LOGIN_PASSWORD_HASH`

Keep live execution disabled:
`CTS_LIVE_EXECUTION_ENABLED=false`

## 5. Start locally

```powershell
bun run dev
```

Open the local URL printed by Bun/Vite.

## 6. Validate

```powershell
bun run build
bun run security:check
```

## Safety

Live order execution is intentionally disabled by default. Do not enable it just to test the application. Use Dhan read-only market data and paper trading first.

The repository contains both the original GitHub/TanStack application and the latest Hatchable backend/risk/scanner/live-gateway files that were synchronized from the current Clever Trade Shield build.
