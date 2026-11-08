# Clever Trade Shield — Engineering Rules

- Use Codex/GitHub for development. Do not add or restore Lovable-specific runtime tooling.
- Never expose Dhan credentials or application secrets to browser code.
- Never enable live order execution without a separate security review.
- Keep server-side authorization on every private server function.
- Validate every network-bound input.
- Treat client-side state as untrusted for any future real-money mutation.
- Prefer durable server-side state for order intent, idempotency and reconciliation.
- Run `bun run security:check`, `bun run lint` and `bun run build` before merging.
- Candidate evidence and journal coaching use direct server-side OpenAI requests; Gemini remains the existing committee provider, avoiding platform-specific runtime dependencies.
- Hosted builds use Nitro's Cloudflare module preset with bundled dependencies and dist/ output because the hosting runtime cannot start Bun listeners; CSP must permit TanStack hydration scripts and component styles while keeping external script origins blocked.
- Do not add public/index.html: static index files override the authenticated dashboard at / and prevent the app shell from loading.
- Persisted and edited paper-profile settings pass through one safety-ceiling normalizer; scanner approvals recheck quote age and risk at confirmation time and deduplicate approval IDs.
- Access uses Cloud email/password auth; private screens live under `src/routes/_authenticated/` and every private server function requires the server-side `owner` role (first sign-up only), so extra sign-ups get no data.
- CSP `connect-src` must include the backend origin and `frame-ancestors` must allow the editor preview, otherwise sign-in and the preview break. CSP/COOP/CORP headers apply only to production builds; the dev-server preview runs framed with injected tooling and goes blank under them.
- External assistants connect through the app's MCP server (`src/lib/mcp/`), signing in with OAuth as the owner; MCP tools stay read-only and use the caller's own database access so RLS still applies.
- Recovery uses shared router loading/error screens plus a dependency-free HTML startup/server fallback; auth outages must remain retryable without clearing the session or reporting access denied.
- Email-confirmation guidance alone uses server-side AI Gateway Responses with owner authorization and durable denial pauses; existing trading providers stay unchanged, and guidance never mutates verification or permissions.
- Integrated Researcher stores resumable owner-scoped runs and Dhan candle evidence; daily watchlist handoffs stay stale in CTS until independent intraday scanning, preventing daily history from authorizing trades.
