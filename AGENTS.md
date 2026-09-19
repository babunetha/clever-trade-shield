# Clever Trade Shield — Engineering Rules

- Use Codex/GitHub for development. Do not add or restore Lovable-specific runtime tooling.
- Never expose Dhan credentials or application secrets to browser code.
- Never enable live order execution without a separate security review.
- Keep server-side authorization on every private server function.
- Validate every network-bound input.
- Treat client-side state as untrusted for any future real-money mutation.
- Prefer durable server-side state for order intent, idempotency and reconciliation.
- Run `bun run security:check`, `bun run lint` and `bun run build` before merging.
