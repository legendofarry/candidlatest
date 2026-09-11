import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { AI_MODEL, createOpenRouterProvider } from "./ai-gateway.server";

const ScreenSchema = z.object({
  verdict: z.enum(["publish", "review", "block"]),
  reason: z.string(),
});

/** Automated screen for named individuals, slurs and obvious libel. */
export async function screenStory(input: { title: string; body: string }) {
  const key = process.env["OPENROUTER_API_KEY"];
  if (!key) return { verdict: "review" as const, reason: "Screening unavailable" };

  const gateway = createOpenRouterProvider(key);
  try {
    const { output } = await generateText({
      model: gateway(AI_MODEL),
      output: Output.object({ schema: ScreenSchema }),
      system:
        "You moderate anonymous Kenyan workplace exit stories. Return publish for ordinary workplace complaints. Return review when an individual person is named, when claims look like unverifiable accusations of crime, or when identifying details appear. Return block for slurs, threats, doxxing, or clear defamation of a named individual. Keep reason under 20 words.",
      prompt: `Title: ${input.title}\n\nStory: ${input.body}`,
    });
    return output;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return { verdict: "review" as const, reason: "Screening inconclusive" };
    }
    console.error("[screenStory]", error);
    return { verdict: "review" as const, reason: "Screening failed" };
  }
}

const ProfileSchema = z.object({
  summary: z.string(),
  descriptor: z.string(),
  industry: z.string().nullable(),
  headquarters: z.string().nullable(),
  size_band: z.string().nullable(),
  founded_year: z.number().nullable(),
  typical_roles: z.array(z.string()),
  reputation_notes: z.string(),
  employment_context: z.string(),
});

/** AI research for a company profile. Never invents accusations. */
export async function researchCompany(input: {
  name: string;
  industry?: string | null;
  county?: string | null;
}) {
  const key = process.env["OPENROUTER_API_KEY"];
  if (!key) return null;

  const gateway = createOpenRouterProvider(key);
  try {
    const { output } = await generateText({
      model: gateway(AI_MODEL),
      output: Output.object({ schema: ProfileSchema }),
      system:
        "You research employers operating in Kenya for a neutral company directory. Only state what is publicly known and general. Never invent scandals, accusations, or named individuals. If unsure of a fact, use null or say it is not publicly documented. descriptor is one line under 90 characters. employment_context describes general Kenyan labour-law context for this sector (contracts, NSSF, SHIF, PAYE, overtime norms), not claims about this employer.",
      prompt: `Company: ${input.name}\nIndustry hint: ${input.industry ?? "unknown"}\nCounty hint: ${input.county ?? "unknown"}`,
    });
    return { ...output, model: AI_MODEL };
  } catch (error) {
    console.error("[researchCompany]", error);
    return null;
  }
}

/** Short catch-up on what changed in a story thread since the reader last looked. */
export async function summarizeStoryActivity(input: {
  title: string;
  body: string;
  comments: string[];
}) {
  if (input.comments.length === 0) return "Nothing new since you last checked in on this story.";

  const key = process.env["OPENROUTER_API_KEY"];
  if (!key) {
    return `${input.comments.length} new ${input.comments.length === 1 ? "comment" : "comments"} since you last checked in.`;
  }

  const gateway = createOpenRouterProvider(key);
  try {
    const { text } = await generateText({
      model: gateway(AI_MODEL),
      system:
        "You summarise new activity on an anonymous Kenyan workplace story thread for someone who already read the story. Write 2-3 short sentences starting from what has changed since they last looked. Neutral, factual, no names of individuals, no advice, under 60 words.",
      prompt: `Story title: ${input.title}\n\nStory: ${input.body.slice(0, 1200)}\n\nNew comments since the reader last looked:\n${input.comments
        .map((comment, index) => `${index + 1}. ${comment}`)
        .join("\n")}`,
    });
    return text.trim();
  } catch (error) {
    console.error("[summarizeStoryActivity]", error);
    return `${input.comments.length} new ${input.comments.length === 1 ? "comment" : "comments"} since you last checked in.`;
  }
}
