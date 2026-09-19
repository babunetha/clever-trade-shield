import { useSession } from "@tanstack/react-start/server";

const SESSION_NAME = process.env.NODE_ENV === "production" ? "__Host-cts-session" : "cts-session";
const SESSION_MAX_AGE = 8 * 60 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

type SessionData = { authenticated?: boolean; issuedAt?: number };
const loginFailures = new Map<string, { count: number; resetAt: number }>();

export function authConfiguration() {
  return { configured: Boolean(process.env["APP_SESSION_SECRET"] && process.env["APP_LOGIN_PASSWORD"]) };
}

export function useAppSession() {
  const secret = process.env["APP_SESSION_SECRET"];
  if (!secret || secret.length < 32) throw new Error("APP_SESSION_SECRET must be configured with at least 32 characters.");
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

function digest(value: string, secret: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + "\0" + value));
}

async function constantTimeEqual(a: ArrayBuffer, b: ArrayBuffer) {
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export function loginAllowed() {
  const key = "global";
  const now = Date.now();
  const current = loginFailures.get(key);
  if (!current || now >= current.resetAt) {
    loginFailures.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_LOGIN_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

export function clearLoginFailures() {
  loginFailures.delete("global");
}

export async function verifyLoginPassword(password: string) {
  const expected = process.env["APP_LOGIN_PASSWORD"];
  const secret = process.env["APP_SESSION_SECRET"];
  if (!expected || !secret) return false;
  const [actual, wanted] = await Promise.all([digest(password, secret), digest(expected, secret)]);
  return constantTimeEqual(actual, wanted);
}

export async function currentAuthState() {
  if (!authConfiguration().configured) return { configured: false, authenticated: false as const };
  const session = await useAppSession();
  return { configured: true, authenticated: session.data.authenticated === true };
}

export async function requireAppSession() {
  if (!authConfiguration().configured) throw new Error("Application authentication is not configured.");
  const session = await useAppSession();
  if (session.data.authenticated !== true) throw new Error("Unauthorized");
  return session;
}
