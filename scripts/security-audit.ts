import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "scripts", "docs"];
const files: string[] = [];

function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".output") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
}

for (const root of roots) walk(root);

const source = files
  .filter((file) => /\.(ts|tsx|js|mjs|cjs)$/.test(file))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const forbidden = [
  new RegExp(["VITE", "DHAN_CLIENT_ID"].join("_"), "i"),
  new RegExp(["VITE", "DHAN_ACCESS_TOKEN"].join("_"), "i"),
  new RegExp(["PUBLIC", "DHAN_CLIENT_ID"].join("_"), "i"),
  new RegExp(["PUBLIC", "DHAN_ACCESS_TOKEN"].join("_"), "i"),
];

if (forbidden.some((pattern) => pattern.test(source))) {
  throw new Error("Security audit failed: forbidden client-secret patterns detected.");
}

if (/LIVE_EXECUTION_ENABLED\s*=\s*true/.test(source)) {
  throw new Error("Security audit failed: live execution was enabled in source.");
}

console.log("Security source audit passed for " + files.length + " files.");
