import { getFirestoreDb } from "./firebase.server";
import type { ProfileRecord } from "./firebase-data.server";

/** The seeded owner account. Candid can always reach every user. */
export const CANDID_USER_ID = "candid-official";
export const CANDID_USERNAME = "candid";

export type MessagePrivacy = "everyone" | "followers" | "nobody";

export type PrivacySettings = {
  user_id: string;
  who_can_message: MessagePrivacy;
  updated_at: string;
};

export type ConversationRecord = {
  id: string;
  participant_ids: string[];
  created_at: string;
  last_message_at: string;
  last_message: string;
  last_sender_id: string | null;
  unread: Record<string, number>;
};

export type Attachment = { url: string; name: string; kind: "image" | "file" };

export type MessageRecord = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment: Attachment | null;
  created_at: string;
  read_at: string | null;
  reactions: Record<string, string[]>;
};

export type ChatParticipant = {
  id: string;
  username: string;
  verified: boolean;
  official: boolean;
};

const now = () => new Date().toISOString();

export function conversationIdFor(a: string, b: string) {
  return [a, b].sort().join("__");
}

/** Creates the Candid owner profile once so it can message anyone. */
export async function ensureCandidAccount() {
  const db = getFirestoreDb();
  const ref = db.collection("profiles").doc(CANDID_USER_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    const profile: ProfileRecord = {
      id: CANDID_USER_ID,
      handle: CANDID_USERNAME,
      county: null,
      banned: false,
      created_at: now(),
      role_label: "Candid team",
      username: CANDID_USERNAME,
      account_type: "company",
      onboarded_at: now(),
    };
    await ref.set(profile);
    await db.collection("usernames").doc(CANDID_USERNAME).set({
      username: CANDID_USERNAME,
      user_id: CANDID_USER_ID,
      created_at: now(),
    });
    await db.collection("verifications").doc(CANDID_USER_ID).set(
      {
        user_id: CANDID_USER_ID,
        account_type: "company",
        badge_status: "claimed",
        owner_verified: true,
        claimed_at: now(),
        checked_at: now(),
      },
      { merge: true },
    );
  }
  return CANDID_USER_ID;
}

async function readParticipants(ids: string[]): Promise<Map<string, ChatParticipant>> {
  const db = getFirestoreDb();
  const unique = [...new Set(ids)].filter(Boolean);
  const map = new Map<string, ChatParticipant>();
  await Promise.all(
    unique.map(async (id) => {
      const [profileSnap, verificationSnap] = await Promise.all([
        db.collection("profiles").doc(id).get(),
        db.collection("verifications").doc(id).get(),
      ]);
      const profile = profileSnap.data() as ProfileRecord | undefined;
      const verification = verificationSnap.data() as
        | { badge_status?: string; owner_verified?: boolean }
        | undefined;
      map.set(id, {
        id,
        username: profile?.username ?? profile?.handle ?? "member",
        verified:
          verification?.badge_status === "claimed" || Boolean(verification?.owner_verified),
        official: id === CANDID_USER_ID,
      });
    }),
  );
  return map;
}

export async function readPrivacySettings(userId: string): Promise<PrivacySettings> {
  const db = getFirestoreDb();
  const snap = await db.collection("privacy_settings").doc(userId).get();
  const data = snap.data() as Partial<PrivacySettings> | undefined;
  return {
    user_id: userId,
    who_can_message: data?.who_can_message ?? "everyone",
    updated_at: data?.updated_at ?? now(),
  };
}

export async function savePrivacySettings(userId: string, who: MessagePrivacy) {
  const db = getFirestoreDb();
  const record: PrivacySettings = { user_id: userId, who_can_message: who, updated_at: now() };
  await db.collection("privacy_settings").doc(userId).set(record, { merge: true });
  return record;
}

export async function isBlocked(blockerId: string, blockedId: string) {
  const db = getFirestoreDb();
  const snap = await db.collection("blocks").doc(`${blockerId}:${blockedId}`).get();
  return snap.exists;
}

export async function toggleBlock(blockerId: string, blockedId: string) {
  if (blockedId === CANDID_USER_ID) throw new Error("Candid cannot be blocked.");
  const db = getFirestoreDb();
  const ref = db.collection("blocks").doc(`${blockerId}:${blockedId}`);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.delete();
    return { blocked: false };
  }
  await ref.set({
    id: ref.id,
    blocker_id: blockerId,
    blocked_id: blockedId,
    created_at: now(),
  });
  return { blocked: true };
}

export async function listBlocked(userId: string) {
  const db = getFirestoreDb();
  const snap = await db.collection("blocks").where("blocker_id", "==", userId).get();
  const ids = snap.docs.map((doc) => (doc.data() as { blocked_id: string }).blocked_id);
  const participants = await readParticipants(ids);
  return ids.map((id) => participants.get(id)!).filter(Boolean);
}

/** Decides whether `senderId` is allowed to open a chat with `recipientId`. */
export async function canMessage(senderId: string, recipientId: string) {
  if (senderId === CANDID_USER_ID) return { allowed: true as const };
  if (senderId === recipientId) return { allowed: false as const, reason: "That is you." };

  const db = getFirestoreDb();
  const [blockedByThem, blockedByYou, settings, followSnap] = await Promise.all([
    isBlocked(recipientId, senderId),
    isBlocked(senderId, recipientId),
    readPrivacySettings(recipientId),
    db.collection("follows").doc(`${recipientId}:${senderId}`).get(),
  ]);

  if (blockedByYou) return { allowed: false as const, reason: "You blocked this account." };
  if (blockedByThem)
    return { allowed: false as const, reason: "This account is not accepting your messages." };
  if (settings.who_can_message === "nobody")
    return { allowed: false as const, reason: "This account has messages turned off." };
  if (settings.who_can_message === "followers" && !followSnap.exists)
    return {
      allowed: false as const,
      reason: "This account only accepts messages from people it follows.",
    };
  return { allowed: true as const };
}

export async function listConversations(userId: string) {
  const db = getFirestoreDb();
  const snap = await db
    .collection("conversations")
    .where("participant_ids", "array-contains", userId)
    .get();
  const records = snap.docs.map((doc) => doc.data() as ConversationRecord);
  const otherIds = records.map((c) => c.participant_ids.find((id) => id !== userId) ?? userId);
  const participants = await readParticipants(otherIds);

  return records
    .map((record) => {
      const otherId = record.participant_ids.find((id) => id !== userId) ?? userId;
      return {
        id: record.id,
        with: participants.get(otherId)!,
        last_message: record.last_message,
        last_message_at: record.last_message_at,
        unread: record.unread?.[userId] ?? 0,
        mine: record.last_sender_id === userId,
      };
    })
    .sort(
      (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
    );
}

export async function unreadMessageCount(userId: string) {
  const conversations = await listConversations(userId);
  return conversations.reduce((total, item) => total + item.unread, 0);
}

/** Opens (or creates) a conversation between two accounts after privacy checks. */
export async function openConversation(userId: string, otherId: string) {
  const gate = await canMessage(userId, otherId);
  if (!gate.allowed) throw new Error(gate.reason);

  const db = getFirestoreDb();
  const id = conversationIdFor(userId, otherId);
  const ref = db.collection("conversations").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    const record: ConversationRecord = {
      id,
      participant_ids: [userId, otherId].sort(),
      created_at: now(),
      last_message_at: now(),
      last_message: "",
      last_sender_id: null,
      unread: { [userId]: 0, [otherId]: 0 },
    };
    await ref.set(record);
  }
  return { conversation_id: id };
}

export async function readConversation(userId: string, conversationId: string) {
  const db = getFirestoreDb();
  const ref = db.collection("conversations").doc(conversationId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Conversation not found");
  const record = snap.data() as ConversationRecord;
  if (!record.participant_ids.includes(userId)) throw new Error("Not your conversation");

  const otherId = record.participant_ids.find((id) => id !== userId) ?? userId;
  const [participants, messagesSnap] = await Promise.all([
    readParticipants([otherId]),
    db.collection("messages").where("conversation_id", "==", conversationId).get(),
  ]);

  const messages = messagesSnap.docs
    .map((doc) => doc.data() as MessageRecord)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Reading the thread clears this user's unread counter and marks their inbox read.
  const batch = db.batch();
  batch.update(ref, { [`unread.${userId}`]: 0 });
  for (const message of messages) {
    if (message.sender_id !== userId && !message.read_at) {
      batch.update(db.collection("messages").doc(message.id), { read_at: now() });
    }
  }
  await batch.commit();

  const gate = await canMessage(userId, otherId);

  return {
    id: conversationId,
    with: participants.get(otherId)!,
    messages,
    can_send: gate.allowed,
    blocked_reason: gate.allowed ? null : gate.reason,
  };
}

export async function sendMessage(input: {
  userId: string;
  conversationId: string;
  body: string;
  attachment: Attachment | null;
}) {
  const db = getFirestoreDb();
  const ref = db.collection("conversations").doc(input.conversationId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Conversation not found");
  const record = snap.data() as ConversationRecord;
  if (!record.participant_ids.includes(input.userId)) throw new Error("Not your conversation");

  const otherId = record.participant_ids.find((id) => id !== input.userId) ?? input.userId;
  const gate = await canMessage(input.userId, otherId);
  if (!gate.allowed) throw new Error(gate.reason);

  const messageRef = db.collection("messages").doc();
  const message: MessageRecord = {
    id: messageRef.id,
    conversation_id: input.conversationId,
    sender_id: input.userId,
    body: input.body,
    attachment: input.attachment,
    created_at: now(),
    read_at: null,
    reactions: {},
  };
  await messageRef.set(message);
  await ref.update({
    last_message: input.body || (input.attachment ? "Attachment" : ""),
    last_message_at: message.created_at,
    last_sender_id: input.userId,
    [`unread.${otherId}`]: (record.unread?.[otherId] ?? 0) + 1,
  });

  return message;
}

export async function toggleReaction(userId: string, messageId: string, emoji: string) {
  const db = getFirestoreDb();
  const ref = db.collection("messages").doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Message not found");
  const message = snap.data() as MessageRecord;
  const current = message.reactions?.[emoji] ?? [];
  const next = current.includes(userId)
    ? current.filter((id) => id !== userId)
    : [...current, userId];
  const reactions = { ...(message.reactions ?? {}), [emoji]: next };
  if (next.length === 0) delete reactions[emoji];
  await ref.update({ reactions });
  return { reactions };
}

/** Public-facing profile used by the chat header and profile detail screen. */
export async function readPublicProfile(username: string, viewerId: string | null) {
  const db = getFirestoreDb();
  const usernameSnap = await db.collection("usernames").doc(username.toLowerCase()).get();
  const userId = (usernameSnap.data() as { user_id?: string } | undefined)?.user_id;
  if (!userId) return null;

  const [participants, profileSnap, followers, following] = await Promise.all([
    readParticipants([userId]),
    db.collection("profiles").doc(userId).get(),
    db.collection("follows").where("following_id", "==", userId).get(),
    db.collection("follows").where("follower_id", "==", userId).get(),
  ]);
  const profile = profileSnap.data() as ProfileRecord | undefined;

  return {
    ...participants.get(userId)!,
    role_label: profile?.role_label ?? null,
    county: profile?.county ?? null,
    socials: profile?.socials ?? null,
    followers: followers.size,
    following: following.size,
    isFollowing: viewerId
      ? followers.docs.some(
          (doc) => (doc.data() as { follower_id: string }).follower_id === viewerId,
        )
      : false,
    isBlocked: viewerId ? await isBlocked(viewerId, userId) : false,
    isSelf: viewerId === userId,
  };
}
