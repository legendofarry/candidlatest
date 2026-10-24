const { applicationDefault, cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");

function normalizePrivateKey(value) {
  return String(value).replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "").trim();
}

function adminCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      const account = JSON.parse(raw);
      const projectId = account.project_id || account.projectId;
      const clientEmail = account.client_email || account.clientEmail;
      const privateKey = account.private_key || account.privateKey;
      if (projectId && clientEmail && privateKey) {
        return cert({ projectId, clientEmail, privateKey: normalizePrivateKey(privateKey) });
      }
    } catch {
      // Fall back to the separate environment variables below.
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || "candid-bbef5";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (clientEmail && privateKey) return cert({ projectId, clientEmail, privateKey: normalizePrivateKey(privateKey) });
  if (process.env.NETLIFY === "true") {
    throw new Error("Set Firebase service-account credentials in Netlify's server-side environment variables.");
  }
  return applicationDefault();
}

if (!getApps().length) {
  initializeApp({
    credential: adminCredential(),
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://candid-bbef5-default-rtdb.firebaseio.com",
  });
}

const db = getFirestore();
const rtdb = getDatabase();
const BATCH_LIMIT = 400;
const CALL_HEARTBEAT_GRACE_MS = 180_000;
const ENDED_CALL_RETENTION_MS = 5 * 60_000;

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
      await deleteMatching("reports", "target_id", "==", story.id);
      await db.collection("story_ai_reviews").doc(story.id).delete().catch(() => undefined);
      await db.collection("employment_evidence").doc(story.id).delete().catch(() => undefined);
    }
    const batch = db.batch();
    stories.docs.forEach((story) => batch.delete(story.ref));
    await batch.commit();
  }

  const userConversations = await db.collection("conversations")
    .where("participant_ids", "array-contains", userId).get();
  for (const conversation of userConversations.docs) {
    await deleteMatching("messages", "conversation_id", "==", conversation.id);
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
    ["notifications", "actor_id", "==", userId],
    ["reports", "reporter_id", "==", userId],
    ["company_ratings", "user_id", "==", userId],
    ["company_rating_answers", "user_id", "==", userId],
    ["salary_reports", "user_id", "==", userId],
    ["votes", "user_id", "==", userId],
    ["comment_likes", "user_id", "==", userId],
    ["story_saves", "user_id", "==", userId],
    ["employment_evidence", "user_id", "==", userId],
    ["employment_evidence_uploads", "user_id", "==", userId],
    ["payment_proof_uploads", "user_id", "==", userId],
    ["account_verification_reviews", "user_id", "==", userId],
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
    "verifications",
    "privacy_settings",
    "notification_preferences",
    "feed_preferences",
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

async function purgeExpiredAccounts() {
  const due = await db.collection("account_lifecycle")
    .where("status", "in", ["deletion_pending", "deactivated", "deletion_in_progress"])
    .where("expires_at", "<=", new Date().toISOString())
    .limit(1)
    .get();
  let failed = 0;
  for (const item of due.docs) {
    const userId = item.id;
    try {
      if (!(await markDeletionInProgress(userId))) continue;
      await purgeAccount(userId);
      console.info("Permanently removed an expired Candid account.", { userId });
    } catch (error) {
      failed += 1;
      console.error("Account removal will be retried.", { userId, error });
      await item.ref.set({ status: "deletion_in_progress", last_error_at: new Date().toISOString() }, { merge: true });
    }
  }
  return { checked: due.size, failed };
}

async function cleanupCallRoom(callId, knownMemberIds = []) {
  const roomRef = rtdb.ref(`call_rooms/${callId}`);
  const [metaSnapshot, requestsSnapshot] = await Promise.all([
    roomRef.child("meta").get(),
    roomRef.child("join_requests").get(),
  ]);
  const meta = metaSnapshot.val();
  const memberIds = new Set([
    ...knownMemberIds,
    ...Object.keys(meta?.members || {}),
  ]);
  const removals = [...memberIds].map((userId) =>
    rtdb.ref(`user_calls/${userId}/${callId}`).remove(),
  );
  if (meta?.members) {
    for (const userId of Object.keys(meta.members)) {
      removals.push(rtdb.ref(`call_expirations/invite_${callId}_${userId}`).remove());
      removals.push(rtdb.ref(`call_expirations/member_${callId}_${userId}`).remove());
    }
  }
  if (requestsSnapshot.exists()) {
    for (const requesterId of Object.keys(requestsSnapshot.val())) {
      removals.push(rtdb.ref(`call_expirations/request_${callId}_${requesterId}`).remove());
    }
  }
  await Promise.all(removals);
  await roomRef.remove();
  await rtdb.ref(`call_expirations/room_${callId}`).remove();
}

async function processRoomExpiration(expirationRef, item, now) {
  const callId = String(item.call_id || "");
  if (!callId) {
    await expirationRef.remove();
    return;
  }
  const roomRef = rtdb.ref(`call_rooms/${callId}/meta`);
  let outcome = "active";
  let nextMeta = null;
  const result = await roomRef.transaction((current) => {
    if (!current) {
      outcome = "missing";
      return;
    }
    if (current.status === "ended") {
      outcome = Number(current.ended_at || 0) + ENDED_CALL_RETENTION_MS <= now ? "cleanup" : "ended";
      nextMeta = current;
      return;
    }
    if (current.status === "ringing") {
      const expiresAt = Number(current.expires_at || 0);
      if (!expiresAt || expiresAt > now) {
        outcome = "ringing";
        nextMeta = current;
        return;
      }
      outcome = "ended";
      nextMeta = { ...current, status: "ended", ended_at: now, end_reason: "invitation_expired" };
      return nextMeta;
    }
    if (current.status === "active") {
      const creator = current.members?.[current.creator_id];
      const lastSeen = Number(creator?.last_seen_at || current.last_activity_at || 0);
      if (!creator || creator.status !== "active" || !lastSeen || now - lastSeen >= CALL_HEARTBEAT_GRACE_MS) {
        outcome = "ended";
        nextMeta = { ...current, status: "ended", ended_at: now, end_reason: "creator_disconnected" };
        return nextMeta;
      }
      outcome = "active";
      nextMeta = current;
      return;
    }
    outcome = "missing";
    return;
  }, undefined, false);

  const meta = result.snapshot.val() || nextMeta;
  const knownMembers = Array.isArray(item.member_uids) ? item.member_uids : [];
  if (outcome === "cleanup" || outcome === "missing") {
    await cleanupCallRoom(callId, knownMembers);
    return;
  }
  if (outcome === "ended") {
    const endedAt = Number(meta?.ended_at || now);
    const memberIds = [...new Set([...knownMembers, ...Object.keys(meta?.members || {})])];
    await Promise.all([
      ...memberIds.map((userId) => rtdb.ref(`user_calls/${userId}/${callId}`).remove()),
      ...memberIds.map((userId) => rtdb.ref(`call_expirations/invite_${callId}_${userId}`).remove()),
      ...memberIds.map((userId) => rtdb.ref(`call_expirations/member_${callId}_${userId}`).remove()),
    ]);
    await expirationRef.set({
      type: "room",
      call_id: callId,
      expires_at: endedAt + ENDED_CALL_RETENTION_MS,
      member_uids: memberIds,
    });
    return;
  }
  if (outcome === "active") {
    const lastSeen = Number(meta?.members?.[meta?.creator_id]?.last_seen_at || meta?.last_activity_at || now);
    await expirationRef.set({ type: "room", call_id: callId, expires_at: lastSeen + CALL_HEARTBEAT_GRACE_MS, member_uids: Object.keys(meta?.members || {}) });
    return;
  }
  const nextExpiry = Number(meta?.expires_at || item.expires_at || now + 60_000);
  await expirationRef.set({ type: "room", call_id: callId, expires_at: nextExpiry, member_uids: Object.keys(meta?.members || {}) });
}

async function processInviteExpiration(expirationRef, item, now) {
  const callId = String(item.call_id || "");
  const userId = String(item.user_id || "");
  if (!callId || !userId) {
    await expirationRef.remove();
    return;
  }
  const metaRef = rtdb.ref(`call_rooms/${callId}/meta`);
  let removed = false;
  let rescheduledUntil = 0;
  let metaAfter = null;
  const result = await metaRef.transaction((current) => {
    if (!current || current.status === "ended") {
      metaAfter = current;
      return;
    }
    const invitation = current.members?.[userId];
    if (!invitation || invitation.status !== "invited") {
      metaAfter = current;
      return;
    }
    if (Number(invitation.expires_at || 0) > now) {
      rescheduledUntil = Number(invitation.expires_at);
      metaAfter = current;
      return;
    }
    const members = { ...current.members };
    delete members[userId];
    removed = true;
    metaAfter = { ...current, members };
    return metaAfter;
  }, undefined, false);
  metaAfter = result.snapshot.val() || metaAfter;
  if (rescheduledUntil) {
    await expirationRef.set({ type: "invite", call_id: callId, user_id: userId, expires_at: rescheduledUntil });
    return;
  }
  const roomEndedOrMissing = !metaAfter || metaAfter.status === "ended";
  if (removed || roomEndedOrMissing || !metaAfter?.members?.[userId]) {
    await Promise.all([
      rtdb.ref(`user_calls/${userId}/${callId}`).remove(),
      rtdb.ref(`call_rooms/${callId}/join_requests/${userId}`).remove(),
    ]);
  }
  await expirationRef.remove();
  if (metaAfter && metaAfter.status !== "ended") {
    await rtdb.ref(`call_expirations/room_${callId}`).update({ member_uids: Object.keys(metaAfter.members || {}) });
  }
}

async function processMemberExpiration(expirationRef, item, now) {
  const callId = String(item.call_id || "");
  const userId = String(item.user_id || "");
  if (!callId || !userId) {
    await expirationRef.remove();
    return;
  }
  const metaRef = rtdb.ref(`call_rooms/${callId}/meta`);
  let outcome = "inactive";
  let updatedMeta = null;
  const result = await metaRef.transaction((current) => {
    if (!current || current.status === "ended") {
      outcome = "ended";
      updatedMeta = current;
      return;
    }
    const member = current.members?.[userId];
    if (!member || member.status !== "active" || current.status !== "active") {
      outcome = "inactive";
      updatedMeta = current;
      return;
    }
    const lastSeen = Number(member.last_seen_at || 0);
    if (lastSeen && now - lastSeen < CALL_HEARTBEAT_GRACE_MS) {
      outcome = "active";
      updatedMeta = current;
      return;
    }
    if (current.creator_id === userId) {
      outcome = "creator_ended";
      updatedMeta = { ...current, status: "ended", ended_at: now, end_reason: "creator_disconnected" };
      return updatedMeta;
    }
    const members = { ...current.members };
    delete members[userId];
    outcome = "member_removed";
    updatedMeta = { ...current, members };
    return updatedMeta;
  }, undefined, false);
  updatedMeta = result.snapshot.val() || updatedMeta;

  if (outcome === "active") {
    await expirationRef.set({ type: "member", call_id: callId, user_id: userId,
      expires_at: Number(updatedMeta?.members?.[userId]?.last_seen_at) + CALL_HEARTBEAT_GRACE_MS });
    return;
  }
  if (outcome === "member_removed" || outcome === "ended" || outcome === "inactive") {
    await Promise.all([
      rtdb.ref(`user_calls/${userId}/${callId}`).remove(),
      expirationRef.remove(),
    ]);
  }
  if (outcome === "creator_ended") {
    const members = Object.keys(updatedMeta?.members || {});
    await Promise.all([
      ...members.map((memberId) => rtdb.ref(`user_calls/${memberId}/${callId}`).remove()),
      ...members.map((memberId) => rtdb.ref(`call_expirations/invite_${callId}_${memberId}`).remove()),
      ...members.map((memberId) => rtdb.ref(`call_expirations/member_${callId}_${memberId}`).remove()),
      rtdb.ref(`call_expirations/room_${callId}`).set({ type: "room", call_id: callId,
        expires_at: Number(updatedMeta?.ended_at || now) + ENDED_CALL_RETENTION_MS, member_uids: members }),
      expirationRef.remove(),
    ]);
  } else if (updatedMeta && updatedMeta.status !== "ended") {
    await rtdb.ref(`call_expirations/room_${callId}`).update({ member_uids: Object.keys(updatedMeta.members || {}) });
  }
}

async function processRequestExpiration(expirationRef, item, now) {
  const callId = String(item.call_id || "");
  const userId = String(item.user_id || "");
  if (callId && userId) {
    const requestRef = rtdb.ref(`call_rooms/${callId}/join_requests/${userId}`);
    const request = (await requestRef.get()).val();
    const expiresAt = Number(request?.expires_at || 0);
    if (request && expiresAt > now) {
      await expirationRef.set({ type: "request", call_id: callId, user_id: userId, expires_at: expiresAt });
      return;
    }
    await requestRef.remove();
  }
  await expirationRef.remove();
}

async function cleanupExpiredCalls() {
  const now = Date.now();
  const due = await rtdb.ref("call_expirations")
    .orderByChild("expires_at")
    .endAt(now)
    .limitToFirst(20)
    .get();
  const entries = [];
  due.forEach((child) => entries.push(child));
  let failed = 0;
  for (const child of entries) {
    const item = child.val() || {};
    try {
      if (item.type === "invite") await processInviteExpiration(child.ref, item, now);
      else if (item.type === "member") await processMemberExpiration(child.ref, item, now);
      else if (item.type === "request") await processRequestExpiration(child.ref, item, now);
      else await processRoomExpiration(child.ref, item, now);
    } catch (error) {
      failed += 1;
      console.error("Call cleanup will be retried on the next schedule.", { key: child.key, error });
    }
  }
  return { checked: entries.length, failed };
}

module.exports = { cleanupExpiredCalls, purgeExpiredAccounts };
