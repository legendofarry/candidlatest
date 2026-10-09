import { getFirestoreDb } from "./firebase.server";
import { DEFAULT_MEMBERSHIP, type MembershipTier } from "./membership";

export async function switchMembership(userId: string, tier: MembershipTier) {
  const db = getFirestoreDb();
  const profileRef = db.collection("profiles").doc(userId);
  const profileSnapshot = await profileRef.get();
  if (!profileSnapshot.exists) throw new Error("Could not find your Candid profile.");

  const profile = profileSnapshot.data() as {
    subscription_tier?: MembershipTier;
    subscription_status?: string | null;
    subscription_provider?: string | null;
    subscription_started_at?: string | null;
    subscription_period_ends_at?: string | null;
    subscription_switch_unlocked?: boolean;
  } | undefined;
  const currentTier = profile?.subscription_tier ?? "basic";
  const switchUnlocked = profile?.subscription_switch_unlocked === true || currentTier === "gold";

  if (tier !== "basic" && !switchUnlocked) {
    throw new Error("Premium and Gold packages are unavailable for this account.");
  }
  if (currentTier === tier) return { tier, changed: false, switchUnlocked };

  await profileRef.set(
    {
      id: userId,
      ...(tier === "basic"
        ? DEFAULT_MEMBERSHIP
        : {
            subscription_tier: tier,
            subscription_status: profile?.subscription_status ?? "active",
            subscription_provider: profile?.subscription_provider ?? null,
            subscription_started_at: profile?.subscription_started_at ?? new Date().toISOString(),
            subscription_period_ends_at: profile?.subscription_period_ends_at ?? null,
          }),
      ...(switchUnlocked ? { subscription_switch_unlocked: true } : {}),
      subscription_changed_at: new Date().toISOString(),
    },
    { merge: true },
  );

  return { tier, changed: true, switchUnlocked };
}
