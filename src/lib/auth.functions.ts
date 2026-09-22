import { createServerFn } from "@tanstack/react-start";
import {
  authConfiguration,
  clearLoginFailures,
  currentAuthState,
  loginAllowed,
  getAppSession,
  verifyLoginPassword,
} from "./auth.server";

export const getAuthStatus = createServerFn({ method: "GET" }).handler(async () => currentAuthState());

export const loginApp = createServerFn({ method: "POST" })
  .inputValidator((input: { password: string }) => ({
    password: typeof input?.password === "string" ? input.password.slice(0, 256) : "",
  }))
  .handler(async ({ data }) => {
    if (!authConfiguration().configured) {
      return { ok: false as const, code: "NOT_CONFIGURED", error: "Set APP_SESSION_SECRET and APP_LOGIN_PASSWORD on the server." };
    }
    if (!loginAllowed()) {
      return { ok: false as const, code: "RATE_LIMITED", error: "Too many failed login attempts. Try again in 15 minutes." };
    }
    if (!(await verifyLoginPassword(data.password))) {
      return { ok: false as const, code: "INVALID_CREDENTIALS", error: "Invalid password." };
    }
    const session = await getAppSession();
    await session.update({ authenticated: true, issuedAt: Date.now() });
    clearLoginFailures();
    return { ok: true as const };
  });

export const logoutApp = createServerFn({ method: "POST" }).handler(async () => {
  if (authConfiguration().configured) {
    const session = await getAppSession();
    await session.clear();
  }
  return { ok: true as const };
});
