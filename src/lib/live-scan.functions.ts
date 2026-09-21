import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth-middleware";

export const runDhanLiveScan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: { config: unknown }) => ({ config: input?.config }))
  .handler(async ({ data }) => {
    const { readDhanCredentialStatus } = await import("./dhan.server");
    if (!readDhanCredentialStatus().clientIdConfigured || !readDhanCredentialStatus().accessTokenConfigured) {
      return { ok: false as const, code: "NOT_CONFIGURED", error: "Configure DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN first." };
    }
    const { runDhanLiveScanners } = await import("./scanner/live-candidates.server");
    return { ok: true as const, candidates: await runDhanLiveScanners(data.config as import("./scanner/definitions").ScannerConfig) };
  });
