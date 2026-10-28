import { expect, test } from "bun:test";
import { completeGatewayText } from "../src/lib/ai-gateway.server";

test("OpenAI evidence fails safely when the server key is missing", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await expect(completeGatewayText({ instructions: "Analyze supplied data only", messages: [{ role: "user", content: "TEST" }] })).rejects.toThrow("AI_NOT_CONFIGURED");
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});