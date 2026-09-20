import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const password = process.argv[2];
if (!password) {
  console.error("Usage: bun scripts/hash-password.ts '<strong-password>'");
  process.exit(1);
}

const N = 16_384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const salt = randomBytes(16);
const derived = Buffer.from(
  await scrypt(password, salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: 32 * 1024 * 1024,
  }),
);

console.log(`scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${derived.toString("hex")}`);
