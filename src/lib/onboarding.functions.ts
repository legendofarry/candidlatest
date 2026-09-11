import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

const socialSchema = z
  .object({
    x: z.string().max(200).nullable().default(null),
    instagram: z.string().max(200).nullable().default(null),
    linkedin: z.string().max(200).nullable().default(null),
    tiktok: z.string().max(200).nullable().default(null),
    website: z.string().max(200).nullable().default(null),
  })
  .default({ x: null, instagram: null, linkedin: null, tiktok: null, website: null });

/** Current signed-in user's profile + whether onboarding is still required. */
export const getOnboardingState = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { readProfile } = await import("./onboarding.server");
    const profile = await readProfile(context.userId);
    return {
      needsOnboarding: !profile?.username,
      username: profile?.username ?? null,
      socials: profile?.socials ?? null,
      accountType: profile?.account_type ?? "unknown",
    };
  });

export const checkUsername = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ username: z.string().max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { checkUsernameAvailability } = await import("./onboarding.server");
    return checkUsernameAvailability(data.username, context.userId);
  });

export const getUsernameSuggestions = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ seed: z.string().max(40).default("candid") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { suggestUsernames } = await import("./onboarding.server");
    return { suggestions: await suggestUsernames(data.seed, 5, context.userId) };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ username: z.string().max(40), socials: socialSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { claimUsername } = await import("./onboarding.server");
    return claimUsername(context.userId, data.username, data.socials);
  });
