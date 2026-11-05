import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireVerifiedFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import { consumeMembershipQuota, releaseMembershipQuota } from "./membership.server";

const storyDraftInputSchema = z.object({
  company: z.string().trim().max(120).default(""),
  industry: z.string().trim().max(80).default(""),
  county: z.string().trim().max(60).default(""),
  reasons: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  customReason: z.string().trim().max(300).default(""),
  position: z.string().trim().max(80).default(""),
  tenure: z.string().trim().max(40).default(""),
  roleLevel: z.string().trim().max(40).default(""),
  wouldReturn: z.boolean().nullable().default(null),
  storyNotes: z.string().trim().max(1800).default(""),
  currentTitle: z.string().trim().max(160).default(""),
  currentBody: z.string().trim().max(6000).default(""),
});

export const generateStoryDrafts = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) => storyDraftInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      await consumeMembershipQuota(context.userId, "story_drafts", 5, "day");
    } catch (error) {
      if (error instanceof Error && error.message === "You’ve reached your daily package limit.") {
        throw new Error("You’ve reached today’s 5 AI draft limit. Try again tomorrow.");
      }
      throw error;
    }
    try {
      const { generateStoryDrafts: generate } = await import("./ai.server");
      return await generate(data);
    } catch (error) {
      try {
        await releaseMembershipQuota(context.userId, "story_drafts", "day");
      } catch (releaseError) {
        console.error("[generateStoryDrafts] could not release quota", releaseError);
      }
      throw error;
    }
  });
