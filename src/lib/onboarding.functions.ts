import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  canSelfSwitchMembership,
  DEFAULT_MEMBERSHIP,
  getEffectiveMembershipTier,
} from "./membership";
import {
  requireFirebaseAuth,
  requireVerifiedFirebaseAuth,
} from "@/integrations/firebase/auth-middleware";

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
      coverUrl: profile?.cover_url ?? null,
      usernameChangedAt: profile?.username_changed_at ?? null,
      socials: profile?.socials ?? null,
      accountType: profile?.account_type ?? "unknown",
      investigationHold: (() => {
        const hold = profile?.investigation_hold;
        return hold === true || (typeof hold === "object" && hold?.active === true);
      })(),
      membership: {
        tier: getEffectiveMembershipTier(profile),
        assignedTier: profile?.subscription_tier ?? DEFAULT_MEMBERSHIP.subscription_tier,
        status: profile?.subscription_status ?? DEFAULT_MEMBERSHIP.subscription_status,
        source:
          profile?.subscription_source ??
          (profile?.subscription_tier && profile.subscription_tier !== "basic"
            ? "manual"
            : "default"),
        provider: profile?.subscription_provider ?? null,
        startedAt: profile?.subscription_started_at ?? null,
        periodEndsAt: profile?.subscription_period_ends_at ?? null,
        version: profile?.subscription_version ?? 0,
        switchUnlocked: canSelfSwitchMembership(profile),
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
    z
      .object({
        seed: z.string().max(40).default("candid"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { suggestUsernames } = await import("./onboarding.server");
    return { suggestions: suggestUsernames(data.seed, 5) };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        username: z.string().max(40),
        socials: socialSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { claimUsername } = await import("./onboarding.server");
    return claimUsername(context.userId, data.username, data.socials);
  });

/** One-time, verified-email action that links the owner's login to @candid. */
export const claimOfficialCandidAccount = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .handler(async ({ context }) => {
    const email = String(context.claims.email ?? "");
    const { claimOfficialCandidAccount: claim } = await import("./onboarding.server");
    return claim(context.userId, email);
  });

export const saveMyProfilePhoto = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        photoUrl: z.string().min(1).max(2048),
        kind: z.enum(["avatar", "cover"]).default("avatar"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveProfilePhoto } = await import("./onboarding.server");
    return saveProfilePhoto(context.userId, data.photoUrl, data.kind);
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
