import { getFirestoreDb } from "./firebase.server";
import type { ProfileRecord } from "./firebase-data.server";

const now = () => new Date().toISOString();
const HOUR = 60 * 60 * 1000;

export type AccountLifecycleAction = "delete" | "deactivate" | "reactivate";

export async function readMyAccountLifecycle(userId: string) {
  const profile = await getFirestoreDb().collection("profiles").doc(userId).get();
  const data = profile.data() as ProfileRecord | undefined;
  return {
    status: data?.account_status ?? "active",
    requestedAt: data?.account_action_at ?? null,
    expiresAt: data?.account_action_expires_at ?? null,
  };
}

export async function changeAccountLifecycle(userId: string, action: AccountLifecycleAction) {
  const db = getFirestoreDb();
  const profileRef = db.collection("profiles").doc(userId);
  const lifecycleRef = db.collection("account_lifecycle").doc(userId);
  const snapshot = await profileRef.get();
  const profile = snapshot.data() as ProfileRecord | undefined;
  if (!snapshot.exists || !profile) throw new Error("Could not find this account.");
  const status = profile.account_status ?? "active";
  const timestamp = now();

  if (action === "reactivate") {
    if (status !== "deletion_pending" && status !== "deactivated") {
      throw new Error("This account does not need reactivation.");
    }
    if (
      profile.account_action_expires_at &&
      Date.parse(profile.account_action_expires_at) <= Date.now()
    ) {
      throw new Error("The recovery period has ended. Account removal is already queued.");
    }
    const batch = db.batch();
    batch.update(profileRef, {
      account_status: "active",
      account_action_at: null,
      account_action_expires_at: null,
      account_reactivated_at: timestamp,
    });
    batch.set(lifecycleRef, {
      user_id: userId,
      status: "active",
      updated_at: timestamp,
      expires_at: null,
    }, { merge: true });
    await batch.commit();
    return { status: "active" as const, expiresAt: null };
  }

  if (status !== "active") {
    throw new Error("This account already has a pending status change.");
  }
  const expiresAt = new Date(Date.now() + (action === "delete" ? 48 : 7 * 24) * HOUR).toISOString();
  const nextStatus = action === "delete" ? "deletion_pending" : "deactivated";
  const batch = db.batch();
  batch.update(profileRef, {
    account_status: nextStatus,
    account_action_at: timestamp,
    account_action_expires_at: expiresAt,
  });
  batch.set(lifecycleRef, {
    user_id: userId,
    status: nextStatus,
    action_at: timestamp,
    expires_at: expiresAt,
    updated_at: timestamp,
  }, { merge: true });
  await batch.commit();
  return { status: nextStatus, expiresAt };
}
