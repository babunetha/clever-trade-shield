import { createFileRoute } from "@tanstack/react-router";
import { processDhanPostback } from "../../../../lib/dhan-postback.server";

export const Route = createFileRoute("/api/public/dhan/postback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        try {
          const result = await processDhanPostback(request.url, body);
          return Response.json(result, { status: 200 });
        } catch {
          return Response.json({ accepted: false }, { status: 401 });
        }
      },
    },
  },
});
