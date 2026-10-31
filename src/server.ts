import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const secured = await normalizeCatastrophicSsrResponse(response);
      const headers = new Headers(secured.headers);
      if (secured.status >= 500 && !headers.has("X-Correlation-ID")) {
        headers.set("X-Correlation-ID", crypto.randomUUID());
      }
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      // The editor preview runs the dev server inside a frame and injects its own
      // tooling scripts; a strict policy there renders a blank screen. The published
      // build always gets the full policy.
      if (!import.meta.env.DEV) {
        headers.set("Cross-Origin-Opener-Policy", "same-origin");
        headers.set("Cross-Origin-Resource-Policy", "same-origin");
        headers.set("Content-Security-Policy", contentSecurityPolicy());
        headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      }
      return new Response(secured.body, {
        status: secured.status,
        statusText: secured.statusText,
        headers,
      });
    } catch (error) {
      const correlationId = crypto.randomUUID();
      console.error({ correlationId, error });
      return new Response(renderErrorPage(), {
        status: 500,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "X-Correlation-ID": correlationId,
        },
      });
    }
  },
};

// Browser sign-in talks directly to the app's auth/data backend, so its origin must be allowed.
// Framing is limited to this site and the editor preview; every other site is blocked.
function contentSecurityPolicy() {
  const backend = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const backendWs = backend.replace(/^http/, "ws");
  const connect = ["'self'", backend, backendWs].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connect}`,
    "img-src 'self' data:",
    "base-uri 'self'",
    "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
