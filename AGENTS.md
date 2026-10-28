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
- The web app targets the existing Bun/Nitro runtime; CSP must permit TanStack hydration scripts and component styles while keeping external script origins blocked.
- Persisted and edited paper-profile settings pass through one safety-ceiling normalizer; scanner approvals recheck quote age and risk at confirmation time and deduplicate approval IDs.
