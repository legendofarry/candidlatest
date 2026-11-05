import {
  DEFAULT_MEMBERSHIP,
  getEffectiveMembershipTier,
  getMembershipEntitlements,
  type MembershipTier,
} from "./membership";
import { getFirestoreDb } from "./firebase.server";

type MembershipRecord = {
  account_type?: "individual" | "company" | "official" | "unknown";
  subscription_tier?: MembershipTier;
  subscription_status?: string | null;
  subscription_source?: "default" | "complimentary" | "manual" | "paid";
  subscription_switch_unlocked?: boolean;
  subscription_version?: number;
};

function canSelfSwitch(profile: MembershipRecord, currentTier: MembershipTier) {
  if (profile.account_type === "official") return false;
  // Preserve the one legacy Gold account's self-service package access. New
  // complimentary Gold assignments do not unlock paid-tier selection.
  return (
    profile.subscription_switch_unlocked === true ||
    (currentTier === "gold" &&
      (!profile.subscription_source || profile.subscription_source === "manual"))
  );
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
  if (tier === "gold")
    throw new Error("Gold is no longer a separate package. Choose Premium instead.");
  const db = getFirestoreDb();
  const profileRef = db.collection("profiles").doc(userId);
  const eventRef = db.collection("subscription_change_events").doc(requestId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existingEvent = await eventRef.get();
    if (existingEvent.exists) {
      const event = existingEvent.data() as {
        user_id?: string;
        to_tier?: MembershipTier;
        version?: number;
      };
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
    if (profile.account_type === "official") {
      throw new Error("The official Candid account permanently uses complimentary Premium access.");
    }
    const currentTier = profile.subscription_tier ?? DEFAULT_MEMBERSHIP.subscription_tier;
    const switchUnlocked = canSelfSwitch(profile, currentTier);
    const currentVersion = Number.isInteger(profile.subscription_version)
      ? profile.subscription_version!
      : 0;

    if (currentVersion !== expectedVersion) {
      throw new Error(
        "Your package changed in another session. Refresh the page before switching again.",
      );
    }
    if (tier !== "basic" && !switchUnlocked) {
      throw new Error("Premium is not available for this account yet.");
    }
    if (currentTier === tier) {
      return {
        tier,
        changed: false,
        duplicate: false,
        version: currentVersion,
        assignmentType: tier === "basic" ? ("default" as const) : ("complimentary" as const),
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

/** Reserve a quota slot with Firestore update-time preconditions to serialize concurrent requests. */
export async function consumeMembershipQuota(
  userId: string,
  feature: "story_catchups" | "new_conversations" | "salary_reports" | "story_drafts",
  limit: number,
  period: "day" | "month",
  initialUsed = 0,
) {
  const db = getFirestoreDb();
  const now = new Date();
  const periodKey =
    period === "day" ? now.toISOString().slice(0, 10) : now.toISOString().slice(0, 7);
  const ref = db.collection("membership_usage").doc(userId);
  const countField = `${feature}_used`;
  const periodField = `${feature}_period`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await ref.get();
    const used =
      snapshot.get(periodField) === periodKey ? Number(snapshot.get(countField) ?? 0) : initialUsed;
    if (used >= limit) {
      throw new Error(
        `You’ve reached your ${period === "day" ? "daily" : "monthly"} package limit.`,
      );
    }
    const value = {
      user_id: userId,
      [periodField]: periodKey,
      [countField]: used + 1,
      updated_at: now.toISOString(),
    };
    try {
      if (snapshot.exists) {
        if (!snapshot.updateTime) throw new Error("Could not update usage right now.");
        await ref.update(value, { updateTime: snapshot.updateTime });
      } else {
        await ref.create(value);
      }
      return { used: used + 1, limit };
    } catch (error) {
      if (!(error instanceof Error) || !/\[(409|412)\]/.test(error.message) || attempt === 4) {
        throw error;
      }
    }
  }
  throw new Error("Could not reserve a package usage slot. Please try again.");
}

export async function releaseMembershipQuota(
  userId: string,
  feature: "story_catchups" | "new_conversations" | "salary_reports" | "story_drafts",
  period: "day" | "month",
) {
  const now = new Date();
  const periodKey =
    period === "day" ? now.toISOString().slice(0, 10) : now.toISOString().slice(0, 7);
  const ref = getFirestoreDb().collection("membership_usage").doc(userId);
  const countField = `${feature}_used`;
  const periodField = `${feature}_period`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await ref.get();
    const used = Number(snapshot.get(countField) ?? 0);
    if (!snapshot.exists || snapshot.get(periodField) !== periodKey || used < 1) return;
    if (!snapshot.updateTime) return;
    try {
      await ref.update(
        { [countField]: used - 1, updated_at: now.toISOString() },
        {
          updateTime: snapshot.updateTime,
        },
      );
      return;
    } catch (error) {
      if (!(error instanceof Error) || !/\[(409|412)\]/.test(error.message) || attempt === 4) {
        throw error;
      }
    }
  }
}

export async function getUserMembershipEntitlements(userId: string) {
  const profile = (await getFirestoreDb().collection("profiles").doc(userId).get()).data() ?? {};
  const tier = getEffectiveMembershipTier(profile);
  return { tier, ...getMembershipEntitlements(tier) };
}
