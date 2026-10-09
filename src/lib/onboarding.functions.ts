import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEFAULT_MEMBERSHIP } from "./membership";
import {
  requireFirebaseAuth,
  requireVerifiedFirebaseAuth,
} from "@/integrations/firebase/auth-middleware";

const candidLensSchema = z
  .object({
    completed: z.boolean(),
    skipped: z.boolean(),
    answers: z.object({
      scenario1: z.enum(["contract", "accept"]).optional(),
      scenario2: z.enum(["breakdown", "wait"]).optional(),
      scenario3: z.enum(["pushback", "doit"]).optional(),
      scenario4: z.enum(["clarity", "continue"]).optional(),
      scenario5: z.enum(["ask", "findout"]).optional(),
    }),
    interests: z.object({
      payBenefits: z.number().int().min(0).max(5),
      contracts: z.number().int().min(0).max(5),
      management: z.number().int().min(0).max(5),
      culture: z.number().int().min(0).max(5),
      career: z.number().int().min(0).max(5),
    }),
  })
  .refine(
    (lens) =>
      lens.skipped ? !lens.completed : lens.completed && Object.keys(lens.answers).length === 5,
    "Complete the quick Candid Lens or skip it.",
  );

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
      photoUrl: profile?.photo_url ?? null,
      candidLens: profile?.candid_lens ?? null,
      usernameChangedAt: profile?.username_changed_at ?? null,
      socials: profile?.socials ?? null,
      accountType: profile?.account_type ?? "unknown",
      membership: {
        tier: profile?.subscription_tier ?? DEFAULT_MEMBERSHIP.subscription_tier,
        status: profile?.subscription_status ?? DEFAULT_MEMBERSHIP.subscription_status,
        provider: profile?.subscription_provider ?? null,
        startedAt: profile?.subscription_started_at ?? null,
        periodEndsAt: profile?.subscription_period_ends_at ?? null,
        switchUnlocked:
          profile?.subscription_switch_unlocked === true || profile?.subscription_tier === "gold",
      },
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
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        username: z.string().max(40),
        socials: socialSchema,
        candidLens: candidLensSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { claimUsername } = await import("./onboarding.server");
    return claimUsername(context.userId, data.username, data.socials, data.candidLens);
  });

export const saveMyProfilePhoto = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ photoUrl: z.string().url().max(2048) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveProfilePhoto } = await import("./onboarding.server");
    return saveProfilePhoto(context.userId, data.photoUrl);
  });

export const updateMyUsername = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ username: z.string().max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { changeUsername } = await import("./onboarding.server");
    return changeUsername(context.userId, data.username);
  });

/**
 * Lets someone whose account type could never be classified tell us directly,
 * instead of being stuck as "unknown" forever.
 */
export const declareAccountType = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ accountType: z.enum(["individual", "company"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { setAccountType } = await import("./onboarding.server");
    return setAccountType(context.userId, data.accountType);
  });
