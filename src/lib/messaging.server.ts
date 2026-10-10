import { getFirestoreDb } from "./firebase.server";
import { FieldValue, type DocumentReference } from "./firestore-rest.server";
import type { CommentRecord, ProfileRecord, StoryRecord } from "./firebase-data.server";
import { getEffectiveMembershipTier } from "./membership";
import {
  createAuthenticatedImageUrl,
  getCloudinaryEvidenceConfig,
  signCloudinaryParams,
  verifyCloudinaryUploadResponse,
} from "./cloudinary-evidence.server";
import { generateId } from "./firebase-data.server";

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

export type MessageRecord = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  reactions: Record<string, string[]>;
  image?: {
    public_id: string;
    version: number;
    format: string;
    bytes: number;
    delivery_url: string;
    delivery_url_expires_at: number;
  } | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
};

export type ChatImageUploadReceipt = {
  ticket_id: string;
  public_id: string;
  version: number;
  signature: string;
  format: string;
  bytes: number;
};

const CHAT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const CHAT_IMAGE_FORMATS = new Set(["jpg", "png", "webp"]);

export async function issueChatImageUpload(input: {
  userId: string;
  conversationId: string;
  size: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}) {
  if (input.size < 1 || input.size > CHAT_IMAGE_MAX_BYTES) {
    throw new Error("Choose an image smaller than 8 MB.");
  }
  const db = getFirestoreDb();
  const conversationSnap = await db.collection("conversations").doc(input.conversationId).get();
  const conversation = conversationSnap.data() as ConversationRecord | undefined;
  if (!conversationSnap.exists || !conversation?.participant_ids.includes(input.userId)) {
    throw new Error("Not your conversation.");
  }
  const otherId = conversation.participant_ids.find((id) => id !== input.userId) ?? input.userId;
  const gate = await canMessage(input.userId, otherId);
  if (!gate.allowed) throw new Error(gate.reason);

  const config = getCloudinaryEvidenceConfig();
  const ticketId = generateId();
  const publicId = `candid-chat/${input.conversationId}/${ticketId}`;
  const format = input.mimeType === "image/jpeg" ? "jpg" : input.mimeType.split("/")[1]!;
  const timestamp = Math.floor(Date.now() / 1000);
  const signedParams = {
    overwrite: "false",
    public_id: publicId,
    timestamp: String(timestamp),
    type: "authenticated",
  };
  const signature = await signCloudinaryParams(signedParams, config.apiSecret);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await db.collection("chat_image_uploads").doc(ticketId).set({
    id: ticketId,
    user_id: input.userId,
    conversation_id: input.conversationId,
    cloudinary_public_id: publicId,
    expected_format: format,
    expected_bytes: input.size,
    status: "issued",
    created_at: now(),
    expires_at: expiresAt,
  });
  return {
    ticketId,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    publicId,
    timestamp,
    type: "authenticated" as const,
    overwrite: false as const,
    signature,
  };
}

export async function discardChatImageUpload(userId: string, ticketId: string) {
  const db = getFirestoreDb();
  const ticketRef = db.collection("chat_image_uploads").doc(ticketId);
  const ticketSnap = await ticketRef.get();
  const ticket = ticketSnap.data() as Record<string, unknown> | undefined;
  if (!ticketSnap.exists || ticket?.["user_id"] !== userId) {
    throw new Error("Image upload not found.");
  }
  if (ticket["status"] === "discarded") return { ok: true as const };
  if (ticket["status"] !== "issued") throw new Error("This image is already attached to a message.");

  const config = getCloudinaryEvidenceConfig();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params = {
    invalidate: "true",
    public_id: String(ticket["cloudinary_public_id"]),
    timestamp,
    type: "authenticated",
  };
  const signature = await signCloudinaryParams(params, config.apiSecret);
  const form = new FormData();
  form.set("api_key", config.apiKey);
  form.set("public_id", params.public_id);
  form.set("timestamp", timestamp);
  form.set("type", params.type);
  form.set("invalidate", params.invalidate);
  form.set("signature", signature);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`,
    { method: "POST", body: form },
  );
  const result = (await response.json().catch(() => ({}))) as {
    result?: string;
    error?: { message?: string };
  };
  if (!response.ok || !["ok", "not found"].includes(result.result ?? "")) {
    throw new Error(result.error?.message || "The image could not be removed. Please retry.");
  }
  await ticketRef.update({ status: "discarded", discarded_at: now() }, ticketSnap.updateTime ? { updateTime: ticketSnap.updateTime } : undefined);
  return { ok: true as const };
}

export type ChatParticipant = {
  id: string;
  username: string;
  photo_url?: string | null;
  verified: boolean;
  official: boolean;
  membership_tier: "basic" | "premium" | "gold";
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
  const timestamp = now();
  const existingProfile = snap.data() as Partial<ProfileRecord> | undefined;
  await ref.set({
    id: CANDID_USER_ID,
    handle: CANDID_USERNAME,
    county: null,
    banned: false,
    created_at: existingProfile?.created_at ?? timestamp,
    role_label: "Candid team",
    username: CANDID_USERNAME,
    account_type: "company",
    verified: true,
    onboarded_at: existingProfile?.onboarded_at ?? timestamp,
  }, { merge: true });
  const usernameRef = db.collection("usernames").doc(CANDID_USERNAME);
  if (!(await usernameRef.get()).exists) {
    await usernameRef.set({
      username: CANDID_USERNAME,
      user_id: CANDID_USER_ID,
      created_at: timestamp,
    });
  }
  const verificationRef = db.collection("account_verifications").doc(CANDID_USER_ID);
  const verificationSnapshot = await verificationRef.get();
  const existingVerification = verificationSnapshot.data() as { claimed_at?: string } | undefined;
  await verificationRef.set({
    user_id: CANDID_USER_ID,
    account_type: "company",
    badge_status: "claimed",
    owner_override: "company",
    owner_verified: true,
    approval_status: "approved",
    claimed_at: existingVerification?.claimed_at ?? timestamp,
    checked_at: timestamp,
  }, { merge: true });
  return CANDID_USER_ID;
}

async function readParticipants(ids: string[]): Promise<Map<string, ChatParticipant>> {
  const db = getFirestoreDb();
  const unique = [...new Set(ids)].filter(Boolean);
  const map = new Map<string, ChatParticipant>();
  await Promise.all(
    unique.map(async (id) => {
      const [profileSnap, verificationSnap, legacyVerificationSnap] = await Promise.all([
        db.collection("profiles").doc(id).get(),
        db.collection("account_verifications").doc(id).get(),
        db.collection("verifications").doc(id).get(),
      ]);
      const profile = profileSnap.data() as ProfileRecord | undefined;
      const verification = (verificationSnap.data() ?? legacyVerificationSnap.data()) as
        { badge_status?: string; owner_verified?: boolean } | undefined;
      map.set(id, {
        id,
        username: profile?.username ?? profile?.handle ?? "member",
        photo_url: profile?.photo_url ?? null,
        verified: id === CANDID_USER_ID || profile?.verified === true || verification?.badge_status === "claimed" || Boolean(verification?.owner_verified),
        official: id === CANDID_USER_ID,
        membership_tier: getEffectiveMembershipTier(profile),
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
  if (blockerId === blockedId) throw new Error("You cannot block yourself.");
  if (blockedId === CANDID_USER_ID) throw new Error("Candid cannot be blocked.");
  const db = getFirestoreDb();
  const profile = await db.collection("profiles").doc(blockedId).get();
  if (!profile.exists || (profile.data() as ProfileRecord).banned) {
    throw new Error("Account unavailable.");
  }
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
  if (senderId === recipientId) return { allowed: false as const, reason: "That is you." };

  const db = getFirestoreDb();
  const [recipientSnap, blockedByThem, blockedByYou, settings, followSnap] = await Promise.all([
    db.collection("profiles").doc(recipientId).get(),
    isBlocked(recipientId, senderId),
    isBlocked(senderId, recipientId),
    readPrivacySettings(recipientId),
    db.collection("follows").doc(`${recipientId}:${senderId}`).get(),
  ]);

  const recipient = recipientSnap.data() as ProfileRecord | undefined;
  if (!recipientSnap.exists || recipient?.banned)
    return { allowed: false as const, reason: "This account is unavailable." };
  if (senderId === CANDID_USER_ID) return { allowed: true as const };

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
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
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
  const messagesWithImages = await Promise.all(
    messages.map(async (message) => {
      if (!message.image) return message;
      const validFor = message.image.delivery_url_expires_at - Math.floor(Date.now() / 1000);
      if (message.image.delivery_url && validFor > 15 * 60) return message;
      const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
      const deliveryUrl = createAuthenticatedImageUrl(
        message.image.public_id,
        message.image.format,
        expiresAt,
      );
      const refreshedImage = {
        ...message.image,
        delivery_url: deliveryUrl,
        delivery_url_expires_at: expiresAt,
      };
      await db.collection("messages").doc(message.id).update({
        "image.delivery_url": deliveryUrl,
        "image.delivery_url_expires_at": expiresAt,
      });
      return { ...message, image: refreshedImage };
    }),
  );

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
    messages: messagesWithImages,
    can_send: gate.allowed,
    blocked_reason: gate.allowed ? null : gate.reason,
  };
}

export async function sendMessage(input: {
  userId: string;
  conversationId: string;
  body: string;
  image?: ChatImageUploadReceipt | null;
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

  let image: MessageRecord["image"] = null;
  let ticketRef: DocumentReference | null = null;
  let ticketUpdateTime: string | undefined;
  if (input.image) {
    ticketRef = db.collection("chat_image_uploads").doc(input.image.ticket_id);
    const ticketSnap = await ticketRef.get();
    const ticket = ticketSnap.data() as Record<string, unknown> | undefined;
    const expectedFormat = String(ticket?.["expected_format"] ?? "");
    const expectedBytes = Number(ticket?.["expected_bytes"] ?? 0);
    const valid =
      ticketSnap.exists &&
      ticket?.["user_id"] === input.userId &&
      ticket?.["conversation_id"] === input.conversationId &&
      ticket?.["status"] === "issued" &&
      String(ticket?.["expires_at"] ?? "") > now() &&
      ticket?.["cloudinary_public_id"] === input.image.public_id &&
      expectedFormat === input.image.format &&
      expectedBytes === input.image.bytes &&
      CHAT_IMAGE_FORMATS.has(input.image.format) &&
      Number.isInteger(input.image.version) &&
      input.image.bytes > 0 &&
      input.image.bytes <= CHAT_IMAGE_MAX_BYTES &&
      /^[a-f0-9]{40,64}$/i.test(input.image.signature);
    if (!valid) throw new Error("That image upload expired or is not valid. Choose it again.");
    const config = getCloudinaryEvidenceConfig();
    const verified = await verifyCloudinaryUploadResponse({
      publicId: input.image.public_id,
      version: input.image.version,
      signature: input.image.signature,
      apiSecret: config.apiSecret,
    });
    if (!verified) throw new Error("Cloudinary could not verify the uploaded image.");
    const deliveryExpiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    image = {
      public_id: input.image.public_id,
      version: input.image.version,
      format: input.image.format,
      bytes: input.image.bytes,
      delivery_url: createAuthenticatedImageUrl(
        input.image.public_id,
        input.image.format,
        deliveryExpiresAt,
      ),
      delivery_url_expires_at: deliveryExpiresAt,
    };
    ticketUpdateTime = ticketSnap.updateTime;
  }

  const messageRef = db.collection("messages").doc();
  const message: MessageRecord = {
    id: messageRef.id,
    conversation_id: input.conversationId,
    sender_id: input.userId,
    body: input.body,
    created_at: now(),
    read_at: null,
    reactions: {},
    image,
    is_deleted: false,
  };
  const batch = db.batch();
  batch.set(messageRef, message);
  batch.update(ref, {
    last_message: input.body || (image ? "📷 Image" : ""),
    last_message_at: message.created_at,
    last_sender_id: input.userId,
    [`unread.${otherId}`]: FieldValue.increment(1),
  });
  if (ticketRef && input.image) {
    batch.update(
      ticketRef,
      { status: "attached", message_id: message.id, attached_at: message.created_at },
      ticketUpdateTime ? { updateTime: ticketUpdateTime } : undefined,
    );
  }
  await batch.commit();

  return message;
}

/** Sender can retract a message for both participants during the first two minutes. */
export async function deleteMessage(userId: string, messageId: string) {
  const db = getFirestoreDb();
  const messageRef = db.collection("messages").doc(messageId);
  const messageSnap = await messageRef.get();
  const message = messageSnap.data() as MessageRecord | undefined;
  if (!messageSnap.exists || !message) throw new Error("Message not found.");
  if (message.sender_id !== userId) throw new Error("You can only delete your own messages.");
  if (message.is_deleted) return { ok: true as const };
  const age = Date.now() - new Date(message.created_at).getTime();
  if (!Number.isFinite(age) || age < 0 || age > 2 * 60 * 1000) {
    throw new Error("Messages can only be deleted for everyone within two minutes.");
  }
  const conversationRef = db.collection("conversations").doc(message.conversation_id);
  const conversationSnap = await conversationRef.get();
  const conversation = conversationSnap.data() as ConversationRecord | undefined;
  if (!conversationSnap.exists || !conversation?.participant_ids.includes(userId)) {
    throw new Error("Not your conversation.");
  }
  const batch = db.batch();
  batch.update(messageRef, {
    body: "",
    image: null,
    reactions: {},
    is_deleted: true,
    deleted_at: now(),
  }, messageSnap.updateTime ? { updateTime: messageSnap.updateTime } : undefined);
  if (conversation.last_message_at === message.created_at && conversation.last_sender_id === userId) {
    batch.update(conversationRef, { last_message: "Message deleted" });
  }
  await batch.commit();
  if (message.image?.public_id) {
    try {
      const config = getCloudinaryEvidenceConfig();
      const timestamp = String(Math.floor(Date.now() / 1000));
      const params = { invalidate: "true", public_id: message.image.public_id, timestamp, type: "authenticated" };
      const signature = await signCloudinaryParams(params, config.apiSecret);
      const form = new FormData();
      form.set("api_key", config.apiKey);
      form.set("public_id", params.public_id);
      form.set("timestamp", timestamp);
      form.set("type", params.type);
      form.set("invalidate", params.invalidate);
      form.set("signature", signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`, { method: "POST", body: form });
      const result = (await response.json().catch(() => ({}))) as { result?: string };
      if (!response.ok || !["ok", "not found"].includes(result.result ?? "")) {
        console.error("Deleted chat message image could not be removed from Cloudinary", message.image.public_id);
      }
    } catch (error) {
      console.error("Deleted chat message image cleanup failed", error);
    }
  }
  return { ok: true as const };
}

export async function toggleReaction(userId: string, messageId: string, emoji: string) {
  const db = getFirestoreDb();
  const ref = db.collection("messages").doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Message not found");
  const message = snap.data() as MessageRecord;
  const conversationSnap = await db.collection("conversations").doc(message.conversation_id).get();
  const conversation = conversationSnap.data() as ConversationRecord | undefined;
  if (!conversationSnap.exists || !conversation?.participant_ids.includes(userId)) {
    throw new Error("Not your conversation");
  }
  const current = message.reactions?.[emoji] ?? [];
  await ref.update({
    [`reactions.${emoji}`]: current.includes(userId)
      ? FieldValue.arrayRemove(userId)
      : FieldValue.arrayUnion(userId),
  });
  return { ok: true };
}

/** Public-facing profile used by the chat header and profile detail screen. */
export async function readPublicProfile(username: string, viewerId: string | null) {
  const db = getFirestoreDb();
  if (username.trim().toLowerCase() === CANDID_USERNAME) await ensureCandidAccount();
  const usernameSnap = await db.collection("usernames").doc(username.toLowerCase()).get();
  const userId = (usernameSnap.data() as { user_id?: string } | undefined)?.user_id;
  if (!userId) return null;

  const [participants, profileSnap, followers, following, stories, comments, profileFollowsViewer] =
    await Promise.all([
      readParticipants([userId]),
      db.collection("profiles").doc(userId).get(),
      db.collection("follows").where("following_id", "==", userId).get(),
      db.collection("follows").where("follower_id", "==", userId).get(),
      db.collection("stories").where("author_id", "==", userId).get(),
      db.collection("comments").where("author_id", "==", userId).get(),
      viewerId
        ? db.collection("follows").doc(`${userId}:${viewerId}`).get()
        : Promise.resolve(null),
    ]);
  const profile = profileSnap.data() as ProfileRecord | undefined;
  if (!profileSnap.exists || profile?.banned) return null;
  const messaging =
    viewerId && viewerId !== userId
      ? await canMessage(viewerId, userId)
      : { allowed: false as const, reason: null };

  return {
    ...participants.get(userId)!,
    role_label: profile?.role_label ?? null,
    photo_url: profile?.photo_url ?? null,
    county: profile?.county ?? null,
    socials: profile?.socials ?? null,
    followers: followers.size,
    following: following.size,
    contributions: {
      stories: stories.docs.filter((doc) => (doc.data() as StoryRecord).status === "published")
        .length,
      comments: comments.docs.filter((doc) => (doc.data() as CommentRecord).status === "published")
        .length,
      joined_at: profile?.onboarded_at ?? profile?.created_at ?? null,
    },
    isFollowing: viewerId
      ? followers.docs.some(
          (doc) => (doc.data() as { follower_id: string }).follower_id === viewerId,
        )
      : false,
    isBlocked: viewerId ? await isBlocked(viewerId, userId) : false,
    followsYou: Boolean(profileFollowsViewer?.exists),
    messaging: { allowed: messaging.allowed, reason: messaging.allowed ? null : messaging.reason },
    isSelf: viewerId === userId,
  };
}
