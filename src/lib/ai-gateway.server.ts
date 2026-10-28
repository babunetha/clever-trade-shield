/** Direct OpenAI decision support; credentials and provider responses stay server-side. */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type ModelMessage } from "ai";

export async function completeGatewayText(options: {
  instructions: string;
  messages: ModelMessage[];
}): Promise<string> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");
  const provider = createOpenAI({ apiKey });
  const result = await generateText({
    model: provider.responses(process.env["OPENAI_MODEL"] || "gpt-4.1-mini"),
    system: options.instructions,
    messages: options.messages,
    maxRetries: 0,
    maxOutputTokens: 1800,
    abortSignal: AbortSignal.timeout(30_000),
    providerOptions: { openai: { store: false } },
  });
  if (!result.text.trim()) throw new Error("AI_EMPTY_RESPONSE");
  return result.text;
}
