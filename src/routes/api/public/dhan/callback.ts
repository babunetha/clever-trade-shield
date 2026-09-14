import { createFileRoute } from "@tanstack/react-router";

/**
 * Placeholder OAuth/consent callback for a future Dhan connection.
 * v1 accepts nothing and stores nothing — tokens must never reach the browser.
 */
export const Route = createFileRoute("/api/public/dhan/callback")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          {
            status: "not_implemented",
            message:
              "Dhan OAuth callback placeholder. Live execution is disabled; no tokens are accepted or stored in this version.",
          },
          { status: 501, headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
