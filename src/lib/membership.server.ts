import { DEFAULT_MEMBERSHIP, type MembershipTier } from "./membership";
import { getFirestoreDb } from "./firebase.server";

type MembershipRecord = {
  subscription_tier?: MembershipTier;
  subscription_status?: string | null;
  subscription_source?: "default" | "complimentary" | "manual" | "paid";
  subscription_switch_unlocked?: boolean;
  subscription_version?: number;
};

function canSelfSwitch(profile: MembershipRecord, currentTier: MembershipTier) {
  // Preserve the one legacy Gold account's self-service package access. New
  // complimentary Gold assignments do not unlock paid-tier selection.
  return profile.subscription_switch_unlocked === true ||
    (currentTier === "gold" && (!profile.subscription_source || profile.subscription_source === "manual"));
}

function isFirestoreConflict(error: unknown) {
  return error instanceof Error && /\[(409|412)\]/.test(error.message);
}

export async function switchMembership(
  userId: string,
  tier: MembershipTier,
  requestId: string,
  expectedVersion: number,
) {
  const db = getFirestoreDb();
  const profileRef = db.collection("profiles").doc(userId);
  const eventRef = db.collection("subscription_change_events").doc(requestId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existingEvent = await eventRef.get();
    if (existingEvent.exists) {
      const event = existingEvent.data() as { user_id?: string; to_tier?: MembershipTier; version?: number };
      if (event.user_id !== userId) throw new Error("Invalid package change request.");
      return {
        tier: event.to_tier ?? tier,
        changed: false,
        duplicate: true,
        version: event.version ?? expectedVersion,
        assignmentType: "complimentary" as const,
        paymentProcessed: false as const,
        switchUnlocked: true,
      };
    }

    const profileSnapshot = await profileRef.get();
    if (!profileSnapshot.exists || !profileSnapshot.updateTime) {
      throw new Error("Could not find your Candid profile. Please refresh and try again.");
    }
    const profile = profileSnapshot.data() as MembershipRecord;
    const currentTier = profile.subscription_tier ?? DEFAULT_MEMBERSHIP.subscription_tier;
    const switchUnlocked = canSelfSwitch(profile, currentTier);
    const currentVersion = Number.isInteger(profile.subscription_version)
      ? profile.subscription_version!
      : 0;

    if (currentVersion !== expectedVersion) {
      throw new Error("Your package changed in another session. Refresh the page before switching again.");
    }
    if (tier !== "basic" && !switchUnlocked) {
      throw new Error("Premium and Gold are not available for this account yet.");
    }
    if (currentTier === tier) {
      return {
        tier,
        changed: false,
        duplicate: false,
        version: currentVersion,
        assignmentType: tier === "basic" ? "default" as const : "complimentary" as const,
        paymentProcessed: false as const,
        switchUnlocked,
      };
    }

    const now = new Date().toISOString();
    const nextVersion = currentVersion + 1;
    const source = tier === "basic" ? "default" : "complimentary";
    const event = {
      id: requestId,
      user_id: userId,
      from_tier: currentTier,
      to_tier: tier,
      from_status: profile.subscription_status ?? "active",
      to_status: "active",
      source,
      initiated_by: userId,
      initiated_by_type: "member",
      change_type: "self_service",
      payment_processed: false,
      created_at: now,
      effective_at: now,
      version: nextVersion,
    };
    const patch = {
      subscription_tier: tier,
      subscription_status: "active",
      subscription_source: source,
      subscription_provider: null,
      subscription_started_at: null,
      subscription_period_ends_at: null,
      subscription_assigned_by: userId,
      subscription_assigned_at: now,
      subscription_changed_at: now,
      subscription_change_id: requestId,
      subscription_version: nextVersion,
      ...(switchUnlocked ? { subscription_switch_unlocked: true } : {}),
    };

    try {
      const batch = db.batch();
      batch.update(profileRef, patch, { updateTime: profileSnapshot.updateTime });
      batch.create(eventRef, event);
      await batch.commit();
      return {
        tier,
        changed: true,
        duplicate: false,
        version: nextVersion,
        assignmentType: source,
        paymentProcessed: false as const,
        switchUnlocked,
      };
    } catch (error) {
      if (!isFirestoreConflict(error) || attempt === 2) {
        if (isFirestoreConflict(error)) {
          throw new Error("Your package is being changed elsewhere. Refresh and try again.");
        }
        throw error;
      }
    }
  }

  throw new Error("Your package could not be changed. Refresh and try again.");
}
