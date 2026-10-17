export const MEMBERSHIP_PLANS = {
  basic: { name: "Basic", priceKes: 0, interval: "Free" },
  premium: { name: "Premium", priceKes: 500, interval: "per month" },
  gold: { name: "Gold", priceKes: 1000, interval: "per month" },
} as const;

export type MembershipTier = keyof typeof MEMBERSHIP_PLANS;
export type MembershipStatus = "active" | "cancelled" | "expired" | "past_due";
export type MembershipSource = "default" | "complimentary" | "manual" | "paid";

export type MembershipProfile = {
  account_type?: "individual" | "company" | "official" | "unknown" | null;
  subscription_tier?: MembershipTier | null;
  subscription_status?: MembershipStatus | null;
  subscription_period_ends_at?: string | null;
  subscription_source?: MembershipSource | null;
  subscription_version?: number | null;
  subscription_switch_unlocked?: boolean;
};

export const DEFAULT_MEMBERSHIP = {
  subscription_tier: "basic" as MembershipTier,
  subscription_status: "active" as MembershipStatus,
  subscription_provider: null,
  subscription_started_at: null,
  subscription_period_ends_at: null,
  subscription_source: "default" as MembershipSource,
  subscription_version: 0,
};

/** Feature limits are defined once here and enforced by both UI and server actions. */
export const MEMBERSHIP_ENTITLEMENTS = {
  basic: { membershipBadge: false, maxPinnedStories: 0 },
  premium: { membershipBadge: true, maxPinnedStories: 1 },
  gold: { membershipBadge: true, maxPinnedStories: 3 },
} as const satisfies Record<MembershipTier, { membershipBadge: boolean; maxPinnedStories: number }>;

export function getMembershipEntitlements(tier: MembershipTier) {
  return MEMBERSHIP_ENTITLEMENTS[tier];
}

export function getEffectiveMembershipTier(
  profile: MembershipProfile | null | undefined,
  now = Date.now(),
): MembershipTier {
  if (profile?.account_type === "official") return "gold";
  const currentTier = profile?.subscription_tier ?? "basic";
  const source = profile?.subscription_source ?? (currentTier === "basic" ? "default" : "manual");
  return getMembershipBadgeTier(
    currentTier,
    profile?.subscription_status,
    profile?.subscription_period_ends_at,
    now,
    source,
  );
}

export function canSelfSwitchMembership(profile: MembershipProfile | null | undefined) {
  if (profile?.account_type === "official") return false;
  const currentTier = profile?.subscription_tier ?? "basic";
  return (
    profile?.subscription_switch_unlocked === true ||
    (currentTier === "gold" &&
      (!profile?.subscription_source || profile.subscription_source === "manual"))
  );
}

export function getMembershipBadgeTier(
  tier: MembershipTier | null | undefined,
  status: MembershipStatus | null | undefined,
  periodEndsAt: string | null | undefined,
  now = Date.now(),
  source: MembershipSource = "default",
): MembershipTier {
  const currentTier = tier ?? "basic";
  if (currentTier === "basic") return "basic";
  const currentStatus = status ?? "active";
  const periodEnd = periodEndsAt ? new Date(periodEndsAt).getTime() : NaN;
  const active =
    (currentStatus === "active" && (source !== "paid" || !periodEndsAt || periodEnd > now)) ||
    (currentStatus === "cancelled" && source === "paid" && periodEnd > now);
  return active ? currentTier : "basic";
}
