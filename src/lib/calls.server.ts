import { generateId } from "./firebase-data.server";
import { getFirebaseRealtimeDatabaseCredentials, getFirestoreDb } from "./firebase.server";
import type { ConversationRecord } from "./messaging.server";

type CallMeta = {
  id: string;
  creator_id: string;
  media: "audio" | "video";
  status: "ringing" | "active" | "ended";
  created_at: string;
  expires_at: number;
  last_activity_at: number;
  ended_at?: number;
  end_reason?: string;
  members: Record<string, { status: "active" | "invited"; expires_at?: number; last_seen_at?: number }>;
};

const INVITATION_TTL_MS = 90_000;
const CREATOR_HEARTBEAT_GRACE_MS = 180_000;

function realtimeDatabaseUrl() {
  const url = process.env["FIREBASE_DATABASE_URL"] ?? process.env["VITE_FIREBASE_DATABASE_URL"];
  if (!url) throw new Error("Voice and video calls are not configured on this Candid server.");
  return url.replace(/\/$/, "");
}

async function databaseRequest<T>(path: string, method: "GET" | "PUT" | "PATCH", body?: unknown): Promise<T> {
  const { accessToken } = await getFirebaseRealtimeDatabaseCredentials();
  const url = `${realtimeDatabaseUrl()}/${path.replace(/^\//, "")}.json?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error("Firebase could not update the call. Please try again.");
  return (await response.json()) as T;
}

/** Compare-and-set a room record so accept/end/expiry races resolve in one order. */
async function updateCallMeta(callId: string, mutate: (current: CallMeta | null) => CallMeta | null) {
  const path = `call_rooms/${callId}/meta`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { accessToken } = await getFirebaseRealtimeDatabaseCredentials();
    const url = `${realtimeDatabaseUrl()}/${path}.json?access_token=${encodeURIComponent(accessToken)}`;
    const read = await fetch(url, { headers: { "X-Firebase-ETag": "true" } });
    if (!read.ok) throw new Error("Firebase could not read the call state.");
    const etag = read.headers.get("ETag");
    const current = (await read.json()) as CallMeta | null;
    if (!etag) throw new Error("Firebase did not return a call-state version.");
    const next = mutate(current);
    if (next === current) return current;
    const write = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": etag },
      body: JSON.stringify(next),
    });
    if (write.ok) return next;
    if (write.status !== 412) throw new Error("Firebase could not update the call state.");
  }
  throw new Error("The call changed at the same time. Please try again.");
}

async function updateCallExpiration(callId: string, value: { type: "room"; call_id: string; expires_at: number; member_uids: string[] } | null) {
  await databaseRequest(`call_expirations/room_${callId}`, "PUT", value);
}

function roomExpiration(callId: string, expiresAt: number, memberUids: string[]) {
  return { type: "room" as const, call_id: callId, expires_at: expiresAt, member_uids: [...new Set(memberUids)] };
}

async function updateInviteExpiration(callId: string, userId: string, expiresAt: number | null) {
  await databaseRequest(`call_expirations/invite_${callId}_${userId}`, "PUT", expiresAt === null ? null : {
    type: "invite", call_id: callId, user_id: userId, expires_at: expiresAt,
  });
}

async function updateMemberExpiration(callId: string, userId: string, expiresAt: number | null) {
  await databaseRequest(`call_expirations/member_${callId}_${userId}`, "PUT", expiresAt === null ? null : {
    type: "member", call_id: callId, user_id: userId, expires_at: expiresAt,
  });
}

async function updateRequestExpiration(callId: string, userId: string, expiresAt: number | null) {
  await databaseRequest(`call_expirations/request_${callId}_${userId}`, "PUT", expiresAt === null ? null : {
    type: "request", call_id: callId, user_id: userId, expires_at: expiresAt,
  });
}

async function removeCallIndex(userId: string, callId: string) {
  await databaseRequest(`user_calls/${userId}/${callId}`, "PUT", null);
}

async function reserveCallIndex(userId: string, callId: string, state: "active" | "invited") {
  const path = `user_calls/${userId}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { accessToken } = await getFirebaseRealtimeDatabaseCredentials();
    const url = `${realtimeDatabaseUrl()}/${path}.json?access_token=${encodeURIComponent(accessToken)}`;
    const read = await fetch(url, { headers: { "X-Firebase-ETag": "true" } });
    if (!read.ok) throw new Error("Firebase could not check the current call.");
    const etag = read.headers.get("ETag");
    const current = (await read.json()) as Record<string, string> | null;
    if (!etag) throw new Error("Firebase did not return a call-index version.");
    if (current && Object.keys(current).length) return false;
    const write = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": etag },
      body: JSON.stringify({ [callId]: state }),
    });
    if (write.ok) return true;
    if (write.status !== 412) throw new Error("Firebase could not reserve the call.");
  }
  throw new Error("The call index changed at the same time. Please try again.");
}

async function readUserCalls(userId: string) {
  return (await databaseRequest<Record<string, "active" | "invited"> | null>(`user_calls/${userId}`, "GET")) ?? {};
}

async function ensureCanCall(userId: string) {
  const snapshot = await getFirestoreDb().collection("profiles").doc(userId).get();
  const profile = snapshot.data() as { banned?: boolean; account_status?: string } | undefined;
  if (!snapshot.exists || profile?.banned || ["deactivated", "deletion_pending", "deletion_in_progress"].includes(profile?.account_status ?? "")) {
    throw new Error("That account cannot join a call right now.");
  }
}

async function readConversationPartner(userId: string, conversationId: string) {
  const snapshot = await getFirestoreDb().collection("conversations").doc(conversationId).get();
  const conversation = snapshot.data() as ConversationRecord | undefined;
  if (!snapshot.exists || !conversation?.participant_ids.includes(userId)) throw new Error("Conversation not found.");
  const partnerId = conversation.participant_ids.find((participant) => participant !== userId);
  if (!partnerId) throw new Error("A call needs another conversation participant.");
  await ensureCanCall(partnerId);
  return partnerId;
}

export async function startCall(userId: string, conversationId: string, media: "audio" | "video") {
  const partnerId = await readConversationPartner(userId, conversationId);
  const [myCalls, partnerCalls] = await Promise.all([readUserCalls(userId), readUserCalls(partnerId)]);
  if (Object.keys(myCalls).length) throw new Error("Respond to your existing call invitation before starting another call.");
  const partnerActiveRoom = Object.entries(partnerCalls).find(([, state]) => state === "active")?.[0];
  if (partnerActiveRoom) {
    const activeMeta = await databaseRequest<CallMeta | null>(`call_rooms/${partnerActiveRoom}/meta`, "GET");
    if (!activeMeta || activeMeta.status !== "active" || !activeMeta.members?.[partnerId]) throw new Error("That call is no longer active. Refresh and try again.");
    const caller = await getFirestoreDb().collection("profiles").doc(userId).get();
    const requestExpiresAt = Date.now() + INVITATION_TTL_MS;
    await updateRequestExpiration(partnerActiveRoom, userId, requestExpiresAt);
    try {
      await databaseRequest(`call_rooms/${partnerActiveRoom}/join_requests/${userId}`, "PUT", {
        user_id: userId,
        username: caller.get("username") ?? "member",
        conversation_id: conversationId,
        requested_at: new Date().toISOString(),
        expires_at: requestExpiresAt,
      });
    } catch (error) {
      await updateRequestExpiration(partnerActiveRoom, userId, null).catch(() => undefined);
      throw error;
    }
    return { state: "join_requested" as const, call_id: partnerActiveRoom };
  }
  if (Object.keys(partnerCalls).length) throw new Error("That person has another call invitation pending.");

  const id = generateId();
  const now = Date.now();
  const invitationExpiresAt = now + INVITATION_TTL_MS;
  await updateCallExpiration(id, roomExpiration(id, invitationExpiresAt, [userId, partnerId]));
  await updateMemberExpiration(id, userId, invitationExpiresAt);
  await updateInviteExpiration(id, partnerId, invitationExpiresAt);
  if (!(await reserveCallIndex(userId, id, "active"))) {
    await updateCallExpiration(id, null);
    await updateMemberExpiration(id, userId, null);
    await updateInviteExpiration(id, partnerId, null);
    throw new Error("Respond to your existing call invitation before starting another call.");
  }
  if (!(await reserveCallIndex(partnerId, id, "invited"))) {
    await removeCallIndex(userId, id);
    await updateCallExpiration(id, null);
    await updateMemberExpiration(id, userId, null);
    await updateInviteExpiration(id, partnerId, null);
    throw new Error("That person has another call or invitation.");
  }
  const meta: CallMeta = {
    id,
    creator_id: userId,
    media,
    status: "ringing",
    created_at: new Date().toISOString(),
    expires_at: invitationExpiresAt,
    last_activity_at: now,
    members: {
      [userId]: { status: "active", last_seen_at: now },
      [partnerId]: { status: "invited", expires_at: invitationExpiresAt },
    },
  };
  try {
    await databaseRequest(`call_rooms/${id}/meta`, "PUT", meta);
  } catch (error) {
    await removeCallIndex(userId, id).catch(() => undefined);
    await removeCallIndex(partnerId, id).catch(() => undefined);
    await updateCallExpiration(id, null).catch(() => undefined);
    await updateMemberExpiration(id, userId, null).catch(() => undefined);
    await updateInviteExpiration(id, partnerId, null).catch(() => undefined);
    throw error;
  }
  return { state: "ringing" as const, call_id: id, participant_id: partnerId };
}

export async function readCallMeta(userId: string, callId: string) {
  const meta = await databaseRequest<CallMeta | null>(`call_rooms/${callId}/meta`, "GET");
  if (!meta || (!meta.members?.[userId] && meta.creator_id !== userId)) throw new Error("Call not found.");
  return meta;
}

export async function respondToCall(userId: string, callId: string, response: "accept" | "decline") {
  const now = Date.now();
  if (response === "accept") await updateMemberExpiration(callId, userId, now + CREATOR_HEARTBEAT_GRACE_MS);
  let transitioned = false;
  const updated = await updateCallMeta(callId, (meta) => {
    transitioned = false;
    const invitation = meta?.members?.[userId];
    if (!meta || meta.status === "ended" || !invitation || invitation.status !== "invited" || (invitation.expires_at ?? meta.expires_at) <= now) return meta;
    transitioned = true;
    if (response === "decline") {
      const members = { ...meta.members };
      delete members[userId];
      return { ...meta, members };
    }
    return { ...meta, status: "active", expires_at: now + CREATOR_HEARTBEAT_GRACE_MS, last_activity_at: now,
      members: { ...meta.members, [userId]: { status: "active", last_seen_at: now } } };
  });
  if (!transitioned || !updated) throw new Error("This call invitation is no longer available.");
  if (response === "decline") {
    await removeCallIndex(userId, callId);
    await updateInviteExpiration(callId, userId, null);
    await updateMemberExpiration(callId, userId, null);
    const room = await databaseRequest<CallMeta | null>(`call_rooms/${callId}/meta`, "GET");
    if (room && room.status !== "ended") await updateCallExpiration(callId, roomExpiration(callId, room.expires_at, Object.keys(room.members ?? {})));
    return { state: "declined" as const };
  }
  await databaseRequest(`user_calls/${userId}/${callId}`, "PUT", "active");
  await updateInviteExpiration(callId, userId, null);
  await updateMemberExpiration(callId, userId, now + CREATOR_HEARTBEAT_GRACE_MS);
  await updateMemberExpiration(callId, updated.creator_id, now + CREATOR_HEARTBEAT_GRACE_MS);
  const room = await databaseRequest<CallMeta | null>(`call_rooms/${callId}/meta`, "GET");
  if (room) await updateCallExpiration(callId, roomExpiration(callId, room.expires_at, Object.keys(room.members ?? {})));
  return { state: "active" as const };
}

export async function approveJoinRequest(userId: string, callId: string, requesterId: string) {
  const meta = await databaseRequest<CallMeta | null>(`call_rooms/${callId}/meta`, "GET");
  if (!meta || meta.creator_id !== userId || meta.status === "ended") throw new Error("Only the call creator can approve a request.");
  const request = await databaseRequest<{ user_id?: string } | null>(`call_rooms/${callId}/join_requests/${requesterId}`, "GET");
  if (!request || request.user_id !== requesterId) throw new Error("Join request not found.");
  await ensureCanCall(requesterId);
  const expiresAt = Date.now() + INVITATION_TTL_MS;
  let reserved = false;
  try {
    await updateInviteExpiration(callId, requesterId, expiresAt);
    if (Object.keys(await readUserCalls(requesterId)).length) throw new Error("That person is already in another call or has a pending invitation.");
    reserved = await reserveCallIndex(requesterId, callId, "invited");
    if (!reserved) throw new Error("That person is already in another call or has a pending invitation.");
    await updateMemberExpiration(callId, requesterId, null);
    const updated = await updateCallMeta(callId, (current) => {
      if (!current || current.creator_id !== userId || current.status === "ended") return current;
      return { ...current, members: { ...current.members, [requesterId]: { status: "invited", expires_at: expiresAt } } };
    });
    if (!updated?.members?.[requesterId] || updated.members[requesterId].status !== "invited") throw new Error("The call has ended.");
    await databaseRequest(`call_rooms/${callId}/join_requests/${requesterId}`, "PUT", null);
    await updateRequestExpiration(callId, requesterId, null);
    await updateCallExpiration(callId, roomExpiration(callId, updated.expires_at, Object.keys(updated.members)));
  } catch (error) {
    if (reserved) {
      await removeCallIndex(requesterId, callId).catch(() => undefined);
      await updateInviteExpiration(callId, requesterId, null).catch(() => undefined);
      await updateMemberExpiration(callId, requesterId, null).catch(() => undefined);
    }
    throw error;
  }
  return { ok: true };
}

export async function cancelJoinRequest(userId: string, callId: string) {
  await databaseRequest(`call_rooms/${callId}/join_requests/${userId}`, "PUT", null);
  await updateRequestExpiration(callId, userId, null);
  return { ok: true };
}

export async function inviteToCall(userId: string, callId: string, username: string) {
  const meta = await databaseRequest<CallMeta | null>(`call_rooms/${callId}/meta`, "GET");
  if (!meta || meta.creator_id !== userId || meta.status === "ended") throw new Error("Only the call creator can invite someone.");
  const normalized = username.trim().replace(/^@/, "").toLowerCase();
  const name = await getFirestoreDb().collection("usernames").doc(normalized).get();
  const inviteeId = name.get("user_id");
  if (typeof inviteeId !== "string" || inviteeId === userId) throw new Error("Account not found.");
  await ensureCanCall(inviteeId);
  const expiresAt = Date.now() + INVITATION_TTL_MS;
  let reserved = false;
  try {
    await updateInviteExpiration(callId, inviteeId, expiresAt);
    if (Object.keys(await readUserCalls(inviteeId)).length) throw new Error("That person is already in a call or has a pending invitation.");
    reserved = await reserveCallIndex(inviteeId, callId, "invited");
    if (!reserved) throw new Error("That person is already in a call or has a pending invitation.");
    await updateMemberExpiration(callId, inviteeId, null);
    const updated = await updateCallMeta(callId, (current) => {
      if (!current || current.creator_id !== userId || current.status === "ended") return current;
      return { ...current, members: { ...current.members, [inviteeId]: { status: "invited", expires_at: expiresAt } } };
    });
    if (!updated?.members?.[inviteeId] || updated.members[inviteeId].status !== "invited") throw new Error("The call has ended.");
    await updateCallExpiration(callId, roomExpiration(callId, updated.expires_at, Object.keys(updated.members)));
  } catch (error) {
    if (reserved) {
      await removeCallIndex(inviteeId, callId).catch(() => undefined);
      await updateInviteExpiration(callId, inviteeId, null).catch(() => undefined);
      await updateMemberExpiration(callId, inviteeId, null).catch(() => undefined);
    }
    throw error;
  }
  return { ok: true };
}

export async function endCall(userId: string, callId: string) {
  const now = Date.now();
  let removedMembers: string[] = [];
  const updated = await updateCallMeta(callId, (meta) => {
    if (!meta?.members?.[userId]) return meta;
    if (meta.creator_id === userId) {
      removedMembers = Object.keys(meta.members);
      return { ...meta, status: "ended", ended_at: now, end_reason: "creator_ended" };
    }
    removedMembers = [userId];
    const members = { ...meta.members };
    delete members[userId];
    return { ...meta, members };
  });
  if (!updated || !removedMembers.length) throw new Error("Call not found.");
  await Promise.all(removedMembers.map((memberId) => removeCallIndex(memberId, callId)));
  await Promise.all(removedMembers.map((memberId) => updateInviteExpiration(callId, memberId, null)));
  await Promise.all(removedMembers.map((memberId) => updateMemberExpiration(callId, memberId, null)));
  if (updated.status === "ended") {
    await updateCallExpiration(callId, roomExpiration(callId, now + 5 * 60_000, removedMembers));
  } else {
    await updateCallExpiration(callId, roomExpiration(callId, updated.expires_at, Object.keys(updated.members ?? {})));
  }
  return { ok: true };
}

export async function heartbeatCall(userId: string, callId: string) {
  const now = Date.now();
  const updated = await updateCallMeta(callId, (meta) => {
    if (!meta || meta.status !== "active" || meta.members?.[userId]?.status !== "active") return meta;
    return { ...meta, last_activity_at: now, members: { ...meta.members, [userId]: { ...meta.members[userId], last_seen_at: now } },
      ...(meta.creator_id === userId ? { expires_at: now + CREATOR_HEARTBEAT_GRACE_MS } : {}) };
  });
  if (!updated?.members?.[userId] || updated.status !== "active") throw new Error("This call is no longer active.");
  await updateMemberExpiration(callId, userId, now + CREATOR_HEARTBEAT_GRACE_MS);
  if (updated.creator_id === userId) await updateCallExpiration(callId, roomExpiration(callId, updated.expires_at, Object.keys(updated.members)));
  return { ok: true };
}
