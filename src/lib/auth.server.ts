import { scrypt as scryptCallback, randomBytes, timingSafeEqual } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { useSession } from "@tanstack/react-start/server";


const SESSION_NAME = process.env["NODE_ENV"] === "production" ? "__Host-cts-session" : "cts-session";
const SESSION_MAX_AGE = 8 * 60 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60 * 1000;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

type SessionData = { authenticated?: boolean; issuedAt?: number };
const loginFailures = new Map<string, { count: number; resetAt: number }>();

export function authConfiguration() {
  return {
    configured: Boolean(
      process.env["APP_SESSION_SECRET"] &&
      process.env["APP_LOGIN_PASSWORD_HASH"],
    ),
  };
}

export function getAppSession() {
  const secret = process.env["APP_SESSION_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error("APP_SESSION_SECRET must be configured with at least 32 characters.");
  }
  // TanStack Start exposes useSession as a server session primitive, not a React hook.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSession<SessionData>({
    name: SESSION_NAME,
    password: secret,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      httpOnly: true,
      maxAge: SESSION_MAX_AGE,
      path: "/",
    },
  });
}

function clientIp() {
  const request = getRequest();
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function loginAllowed(ip = clientIp()) {
  const now = Date.now();
  const current = loginFailures.get(ip);
  if (!current || now >= current.resetAt) {
    loginFailures.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_LOGIN_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

export function clearLoginFailures(ip = clientIp()) {
  loginFailures.delete(ip);
}

function deriveScryptKey(password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {\n  return new Promise((resolve, reject) => {\n    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {\n      if (error) reject(error);\n      else resolve(derivedKey as Buffer);\n    });\n  });\n}\n\nfunction parsePasswordHash(encoded: string) {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, n, r, p, saltHex, hashHex] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P)) return null;
  if (N < 16_384 || R < 1 || P < 1 || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return null;
  return { N, R, P, salt: Buffer.from(saltHex, "hex"), expected: Buffer.from(hashHex, "hex") };
}

export async function verifyLoginPassword(password: string) {
  const encoded = process.env["APP_LOGIN_PASSWORD_HASH"];
  if (!encoded || !password) return false;
  const parsed = parsePasswordHash(encoded);
  if (!parsed || parsed.expected.length !== SCRYPT_KEYLEN) return false;
  const actual = await deriveScryptKey(password, parsed.salt, SCRYPT_KEYLEN, {
    N: parsed.N,
    r: parsed.R,
    p: parsed.P,
    maxmem: 32 * 1024 * 1024,
  });
  return timingSafeEqual(actual, parsed.expected);
}

export async function currentAuthState() {
  if (!authConfiguration().configured) return { configured: false, authenticated: false as const };
  const session = await getAppSession();
  return { configured: true, authenticated: session.data.authenticated === true };
}

export async function requireAppSession() {
  if (!authConfiguration().configured) {
    throw new Error("Application authentication is not configured.");
  }
  const session = await getAppSession();
  if (session.data.authenticated !== true) throw new Error("Unauthorized");
  return session;
}
