const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");

initializeApp();

const db = getFirestore();
const BATCH_LIMIT = 400;

async function deleteMatching(collectionName, field, operator, value) {
  const collection = db.collection(collectionName);
  for (;;) {
    const snapshot = await collection.where(field, operator, value).limit(BATCH_LIMIT).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

async function markDeletionInProgress(userId) {
  const lifecycleRef = db.collection("account_lifecycle").doc(userId);
  const profileRef = db.collection("profiles").doc(userId);
  return db.runTransaction(async (transaction) => {
    const [lifecycle, profile] = await Promise.all([
      transaction.get(lifecycleRef),
      transaction.get(profileRef),
    ]);
    if (!lifecycle.exists) return false;
    const lifecycleData = lifecycle.data();
    const expiresAt = Date.parse(String(lifecycleData.expires_at || ""));
    const allowed = ["deletion_pending", "deactivated", "deletion_in_progress"];
    if (!allowed.includes(lifecycleData.status) || !Number.isFinite(expiresAt) || expiresAt > Date.now()) {
      return false;
    }
    transaction.update(lifecycleRef, { status: "deletion_in_progress", updated_at: new Date().toISOString() });
    if (profile.exists) {
      transaction.update(profileRef, {
        account_status: "deletion_in_progress",
        account_action_expires_at: lifecycleData.expires_at,
      });
    }
    return true;
  });
}

async function purgeAccount(userId) {
  const profileRef = db.collection("profiles").doc(userId);
  const profile = await profileRef.get();
  const username = profile.get("username");

  if (typeof username === "string" && username) {
    const usernameRef = db.collection("usernames").doc(username.toLowerCase());
    const owner = await usernameRef.get();
    if (owner.get("user_id") === userId) await usernameRef.delete();
  }

  const storyCollection = db.collection("stories");
  for (;;) {
    const stories = await storyCollection.where("author_id", "==", userId).limit(100).get();
    if (stories.empty) break;
    for (const story of stories.docs) {
      await deleteMatching("comments", "story_id", "==", story.id);
    }
    const batch = db.batch();
    stories.docs.forEach((story) => batch.delete(story.ref));
    await batch.commit();
  }

  const removals = [
    ["comments", "author_id", "==", userId],
    ["follows", "follower_id", "==", userId],
    ["follows", "following_id", "==", userId],
    ["blocks", "blocker_id", "==", userId],
    ["blocks", "blocked_id", "==", userId],
    ["story_follows", "user_id", "==", userId],
    ["story_likes", "user_id", "==", userId],
    ["saved_stories", "user_id", "==", userId],
    ["saved_community_posts", "user_id", "==", userId],
    ["notifications", "user_id", "==", userId],
    ["notification_tokens", "user_id", "==", userId],
    ["push_tokens", "user_id", "==", userId],
    ["chat_image_uploads", "user_id", "==", userId],
    ["manual_payment_requests", "user_id", "==", userId],
    ["subscription_periods", "user_id", "==", userId],
    ["subscription_change_events", "user_id", "==", userId],
    ["messages", "sender_id", "==", userId],
    ["conversations", "participant_ids", "array-contains", userId],
  ];
  for (const [collection, field, operator, value] of removals) {
    await deleteMatching(collection, field, operator, value);
  }

  for (const collection of [
    "account_verifications",
    "privacy_settings",
    "notification_preferences",
    "device_tokens",
    "profiles",
  ]) {
    await db.collection(collection).doc(userId).delete().catch(() => undefined);
  }

  const officialRef = db.collection("app_config").doc("official-candid-account");
  const officialLink = await officialRef.get();
  if (officialLink.get("user_id") === userId) await officialRef.delete();

  await getAuth().deleteUser(userId).catch((error) => {
    if (error.code !== "auth/user-not-found") throw error;
  });
  await db.collection("account_lifecycle").doc(userId).delete();
}

exports.purgeExpiredAccounts = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Africa/Nairobi",
    region: "africa-south1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async () => {
    const due = await db.collection("account_lifecycle")
      .where("status", "in", ["deletion_pending", "deactivated", "deletion_in_progress"])
      .where("expires_at", "<=", new Date().toISOString())
      .limit(20)
      .get();
    for (const item of due.docs) {
      const userId = item.id;
      try {
        if (!(await markDeletionInProgress(userId))) continue;
        await purgeAccount(userId);
        logger.info("Permanently removed an expired Candid account.", { userId });
      } catch (error) {
        logger.error("Account removal will be retried.", { userId, error });
        await item.ref.set({ status: "deletion_in_progress", last_error_at: new Date().toISOString() }, { merge: true });
      }
    }
  },
);
