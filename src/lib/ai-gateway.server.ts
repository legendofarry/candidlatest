import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createOpenRouterProvider(
  openRouterApiKey: string,
  options?: { structuredOutputs?: boolean },
) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    supportsStructuredOutputs: options?.structuredOutputs ?? false,
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "HTTP-Referer": process.env["OPENROUTER_SITE_URL"] ?? "http://localhost:3000",
      "X-Title": "Candid",
    },
  });
}

export const AI_MODEL = "google/gemini-3.6-flash";
