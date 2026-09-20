import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const scrypt = promisify(scryptCallback);

const rl = createInterface({ input, output });
const password = await rl.question("Operator password (input is visible in this terminal): ");
rl.close();

if (!password || password.length < 12) {
  console.error("Password must be at least 12 characters.");
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
