import { createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireAppSession } from "./auth.server";

export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  await requireAppSession();
  setResponseHeader("Cache-Control", "private, no-store");
  return next();
});
