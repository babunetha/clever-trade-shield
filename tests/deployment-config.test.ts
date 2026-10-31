import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("hosted server configuration", () => {
  test("builds a Cloudflare handler rather than starting a Bun listener", () => {
    const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    expect(config).toMatch(/nitro\(\{\s*preset:\s*"cloudflare-module"/);
    expect(config).not.toMatch(/preset:\s*"bun"/);
  });

  test("preserves the deployment output directory", () => {
    const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    expect(config).toMatch(/output:\s*\{\s*dir:\s*"dist"\s*\}/);
  });
});