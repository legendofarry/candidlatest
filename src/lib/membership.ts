export const MEMBERSHIP_PLANS = {
  basic: { name: "Basic", priceKes: 0, interval: "Free" },
  premium: { name: "Premium", priceKes: 500, interval: "per month" },
  gold: { name: "Gold", priceKes: 1000, interval: "per month" },
} as const;

export type MembershipTier = keyof typeof MEMBERSHIP_PLANS;
export type MembershipStatus = "active" | "cancelled" | "expired" | "past_due";

export const DEFAULT_MEMBERSHIP = {
  subscription_tier: "basic" as MembershipTier,
  subscription_status: "active" as MembershipStatus,
  subscription_provider: null,
  subscription_started_at: null,
  subscription_period_ends_at: null,
};

export function getMembershipBadgeTier(
  tier: MembershipTier | null | undefined,
  status: MembershipStatus | null | undefined,
  periodEndsAt: string | null | undefined,
  now = Date.now(),
): MembershipTier {
  const currentTier = tier ?? "basic";
  if (currentTier === "basic") return "basic";
  const currentStatus = status ?? "active";
  const periodEnd = periodEndsAt ? new Date(periodEndsAt).getTime() : NaN;
  const active = currentStatus === "active" || (currentStatus === "cancelled" && periodEnd > now);
  return active ? currentTier : "basic";
}
