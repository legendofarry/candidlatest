import { getFirestoreDb } from "./firebase.server";
import { accountsBlockEachOther } from "./block.server";
import { consumeMembershipQuota, getUserMembershipEntitlements } from "./membership.server";
import { createHash } from "node:crypto";
import { FieldValue, type DocumentReference } from "./firestore-rest.server";
import {
  getTopLevelCommentCount,
  type CommentRecord,
  type ProfileRecord,
  type StoryRecord,
} from "./firebase-data.server";
import { getEffectiveMembershipTier, getMembershipEntitlements } from "./membership";
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
export const CANDID_WELCOME_MESSAGE =
  "Welcome to Candid 👋\n\nExplore workplace stories, follow discussions and share your experience using your Candid alias. Your email and legal name are not shown with your stories. Please avoid details that could identify you or another person.\n\nWe’re glad you’re here.\nCandid Team";

export async function getCandidAccountId() {
  const db = getFirestoreDb();
  const linked = await db.collection("app_config").doc("official-candid-account").get();
  const userId = (linked.data() as { user_id?: string } | undefined)?.user_id;
  return userId || CANDID_USER_ID;
}

export type MessagePrivacy = "everyone" | "followers" | "nobody";

export type PrivacySettings = {
  user_id: string;
  who_can_message: MessagePrivacy;
  profile_visibility: "public" | "private";
  mention_audience: MessagePrivacy;
  anonymous_contributions_default: boolean;
  message_theme: "default" | "midnight" | "forest" | "ocean" | "sunset";
  updated_at: string;
};

export type ConversationRecord = {
  id: string;
  participant_ids: string[];
  created_at: string;
  activity_at?: string;
  last_message_at: string;
  last_message: string;
  last_sender_id: string | null;
  unread: Record<string, number>;
  preferences?: Record<
    string,
    {
      archived?: boolean;
      muted?: boolean;
      pinned?: boolean;
      deleted?: boolean;
    }
  >;
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
  /** Set when a blocked recipient must never receive this sender-only message. */
  undelivered_to?: string | null;
  delivery_state?: "sent" | "not_delivered";
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
  if (ticket["status"] !== "issued")
    throw new Error("This image is already attached to a message.");

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
  await ticketRef.update(
    { status: "discarded", discarded_at: now() },
    ticketSnap.updateTime ? { updateTime: ticketSnap.updateTime } : undefined,
  );
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

export type ConversationView = {
  id: string;
  with: ChatParticipant | null;
  messages: MessageRecord[];
  unread_cleared: boolean;
  unchanged: boolean;
  activity_at: string;
  hasOlder: boolean;
  nextCursor: { createdAt: string; id: string } | null;
  can_send: boolean;
  blocked_reason: string | null;
};

const now = () => new Date().toISOString();

export function conversationIdFor(a: string, b: string) {
  return [a, b].sort().join("__");
}

/** Creates the Candid owner profile once so it can message anyone. */
export async function ensureCandidAccount() {
  const db = getFirestoreDb();
  const candidUserId = await getCandidAccountId();
  const ref = db.collection("profiles").doc(candidUserId);
  const snap = await ref.get();
  const timestamp = now();
  const existingProfile = snap.data() as Partial<ProfileRecord> | undefined;
  await ref.set(
    {
      id: candidUserId,
      handle: CANDID_USERNAME,
      county: null,
      banned: false,
      created_at: existingProfile?.created_at ?? timestamp,
      display_name: "Candid",
      role_label: "Candid",
      username: CANDID_USERNAME,
      account_type: "official",
      verified: true,
      subscription_tier: "premium",
      subscription_status: "active",
      subscription_source: "complimentary",
      subscription_period_ends_at: null,
      onboarded_at: existingProfile?.onboarded_at ?? timestamp,
    },
    { merge: true },
  );
  const usernameRef = db.collection("usernames").doc(CANDID_USERNAME);
  const usernameSnapshot = await usernameRef.get();
  const usernameOwner = (usernameSnapshot.data() as { user_id?: string } | undefined)?.user_id;
  if (!usernameSnapshot.exists || usernameOwner !== candidUserId) {
    await usernameRef.set({
      username: CANDID_USERNAME,
      user_id: candidUserId,
      created_at: timestamp,
    });
  }
  const verificationRef = db.collection("account_verifications").doc(candidUserId);
  const verificationSnapshot = await verificationRef.get();
  const existingVerification = verificationSnapshot.data() as { claimed_at?: string } | undefined;
  await verificationRef.set(
    {
      user_id: CANDID_USER_ID,
      account_type: "official",
      company_id: null,
      company_name: null,
      company_slug: null,
      owner_override: "official",
      badge_status: "claimed",
      owner_verified: true,
      approval_status: "approved",
      claimed_at: existingVerification?.claimed_at ?? timestamp,
      checked_at: timestamp,
    },
    { merge: true },
  );
  if (candidUserId !== CANDID_USER_ID) {
    const legacyProfileRef = db.collection("profiles").doc(CANDID_USER_ID);
    const legacyProfile = await legacyProfileRef.get();
    if (legacyProfile.exists) {
      await legacyProfileRef.set(
        {
          display_name: "Candid Team",
          role_label: "Candid Team",
          account_type: "unknown",
          verified: false,
          migrated_to: candidUserId,
        },
        { merge: true },
      );
      await db.collection("account_verifications").doc(CANDID_USER_ID).set(
        {
          account_type: "unknown",
          owner_override: null,
          badge_status: "none",
          owner_verified: false,
          approval_status: "none",
        },
        { merge: true },
      );
    }
  }
  return candidUserId;
}

export async function ensureWelcomeMessage(userId: string) {
  const db = getFirestoreDb();
  const candidUserId = await getCandidAccountId();
  if (!userId || userId === candidUserId) return { sent: false };
  const messageId = `system-welcome-${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
  const markerRef = db.collection("system_message_deliveries").doc(messageId);
  const messageRef = db.collection("messages").doc(messageId);
  const conversationId = conversationIdFor(candidUserId, userId);
  const conversationRef = db.collection("conversations").doc(conversationId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [markerSnapshot, messageSnapshot, conversationSnapshot] = await Promise.all([
      markerRef.get(),
      messageRef.get(),
      conversationRef.get(),
    ]);
    if (markerSnapshot.exists || messageSnapshot.exists) return { sent: false };
    const timestamp = now();
    const message: MessageRecord = {
      id: messageId,
      conversation_id: conversationId,
      sender_id: candidUserId,
      body: CANDID_WELCOME_MESSAGE,
      created_at: timestamp,
      read_at: null,
      reactions: {},
      image: null,
      is_deleted: false,
    };
    const batch = db.batch();
    batch.create(markerRef, {
      id: messageId,
      user_id: userId,
      message_id: messageId,
      type: "welcome",
      created_at: timestamp,
    });
    batch.create(messageRef, message);
    if (conversationSnapshot.exists) {
      const conversation = conversationSnapshot.data() as ConversationRecord;
      if (
        !conversation.participant_ids?.includes(candidUserId) ||
        !conversation.participant_ids.includes(userId)
      ) {
        throw new Error("Candid welcome conversation has invalid participants.");
      }
      batch.update(
        conversationRef,
        {
          last_message: CANDID_WELCOME_MESSAGE,
          last_message_at: timestamp,
          activity_at: timestamp,
          last_sender_id: candidUserId,
          [`unread.${userId}`]: FieldValue.increment(1),
        },
        conversationSnapshot.updateTime
          ? { updateTime: conversationSnapshot.updateTime }
          : undefined,
      );
    } else {
      const conversation: ConversationRecord = {
        id: conversationId,
        participant_ids: [candidUserId, userId].sort(),
        created_at: timestamp,
        last_message_at: timestamp,
        activity_at: timestamp,
        last_message: CANDID_WELCOME_MESSAGE,
        last_sender_id: candidUserId,
        unread: { [candidUserId]: 0, [userId]: 1 },
      };
      batch.create(conversationRef, conversation);
    }
    try {
      await batch.commit();
      return { sent: true };
    } catch (error) {
      if (error instanceof Error && /\[(409|412)\]/.test(error.message)) {
        const [latestMarker, latestMessage] = await Promise.all([
          markerRef.get(),
          messageRef.get(),
        ]);
        if (latestMarker.exists || latestMessage.exists) return { sent: false };
        if (attempt < 2) continue;
      }
      throw error;
    }
  }
  return { sent: false };
}

/** One-time/idempotent backfill for existing member accounts. */
export async function sendWelcomeMessagesToExistingMembers() {
  const db = getFirestoreDb();
  await ensureCandidAccount();
  const candidUserId = await getCandidAccountId();
  const profiles = await db.collection("profiles").get();
  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (const profile of profiles.docs) {
    const data = profile.data() as Partial<ProfileRecord>;
    if (
      profile.id === candidUserId ||
      data.account_type === "official" ||
      !(data.username || data.handle)
    ) {
      skipped += 1;
      continue;
    }
    try {
      const result = await ensureWelcomeMessage(profile.id);
      if (result.sent) sent += 1;
      else skipped += 1;
    } catch {
      failures.push(profile.id);
    }
  }
  return { sent, skipped, failed: failures.length, failedUserIds: failures };
}

async function readParticipants(ids: string[]): Promise<Map<string, ChatParticipant>> {
  const db = getFirestoreDb();
  const candidUserId = await getCandidAccountId();
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
        // This field is rendered as @handle and used in /u/$username links.
        username: profile?.username ?? profile?.handle ?? "member",
        photo_url: profile?.photo_url ?? null,
        verified:
          id === candidUserId ||
          profile?.verified === true ||
          verification?.badge_status === "claimed" ||
          Boolean(verification?.owner_verified),
        official: id === candidUserId || profile?.account_type === "official",
        membership_tier: getEffectiveMembershipTier(profile),
      });
    }),
  );
  return map;
}

export async function readPrivacySettings(userId: string): Promise<PrivacySettings> {
  const db = getFirestoreDb();
  const [snap, profileSnap] = await Promise.all([
    db.collection("privacy_settings").doc(userId).get(),
    db.collection("profiles").doc(userId).get(),
  ]);
  const data = snap.data() as Partial<PrivacySettings> | undefined;
  const profile = profileSnap.data() as ProfileRecord | undefined;
  return {
    user_id: userId,
    who_can_message: data?.who_can_message ?? "everyone",
    profile_visibility: profile?.profile_visibility ?? "public",
    mention_audience: data?.mention_audience ?? "everyone",
    anonymous_contributions_default: data?.anonymous_contributions_default === true,
    message_theme: data?.message_theme ?? "default",
    updated_at: data?.updated_at ?? now(),
  };
}

export async function savePrivacySettings(
  userId: string,
  input: {
    whoCanMessage?: MessagePrivacy;
    profileVisibility?: "public" | "private";
    mentionAudience?: MessagePrivacy;
    anonymousContributionsDefault?: boolean;
  },
) {
  const db = getFirestoreDb();
  const previous = await readPrivacySettings(userId);
  const updatedAt = now();
  const record: PrivacySettings = {
    user_id: userId,
    who_can_message: input.whoCanMessage ?? previous.who_can_message,
    profile_visibility: input.profileVisibility ?? previous.profile_visibility,
    mention_audience: input.mentionAudience ?? previous.mention_audience,
    anonymous_contributions_default:
      input.anonymousContributionsDefault ?? previous.anonymous_contributions_default,
    message_theme: previous.message_theme,
    updated_at: updatedAt,
  };
  const batch = db.batch();
  if (input.whoCanMessage) {
    batch.set(
      db.collection("privacy_settings").doc(userId),
      {
        user_id: userId,
        who_can_message: input.whoCanMessage,
        updated_at: updatedAt,
      },
      { merge: true },
    );
  }
  if (input.mentionAudience || input.anonymousContributionsDefault !== undefined) {
    batch.set(
      db.collection("privacy_settings").doc(userId),
      {
        user_id: userId,
        ...(input.mentionAudience ? { mention_audience: input.mentionAudience } : {}),
        ...(input.anonymousContributionsDefault !== undefined
          ? { anonymous_contributions_default: input.anonymousContributionsDefault }
          : {}),
        updated_at: updatedAt,
      },
      { merge: true },
    );
  }
  if (input.profileVisibility) {
    batch.set(
      db.collection("profiles").doc(userId),
      {
        profile_visibility: input.profileVisibility,
        updated_at: updatedAt,
      },
      { merge: true },
    );
  }
  await batch.commit();
  return record;
}

const MESSAGE_THEMES = ["default", "midnight", "forest", "ocean", "sunset"] as const;
export async function readMessageTheme(userId: string) {
  const snap = await getFirestoreDb().collection("privacy_settings").doc(userId).get();
  return (snap.get("message_theme") ?? "default") as (typeof MESSAGE_THEMES)[number];
}
export async function saveMessageTheme(userId: string, theme: (typeof MESSAGE_THEMES)[number]) {
  if (!MESSAGE_THEMES.includes(theme)) throw new Error("Choose an available chat theme.");
  if (["forest", "ocean", "sunset"].includes(theme)) {
    const access = await getUserMembershipEntitlements(userId);
    if (access.tier === "basic") throw new Error("This chat theme is available with Premium.");
  }
  const db = getFirestoreDb();
  await db.collection("privacy_settings").doc(userId).set(
    {
      user_id: userId,
      message_theme: theme,
      updated_at: now(),
    },
    { merge: true },
  );
  return { message_theme: theme };
}

const CHAT_PREFS_MAX_CHARS = 30_000;

/** The member's saved chat look and behaviour, shared across their devices. */
export async function readChatPreferences(userId: string) {
  const snapshot = await getFirestoreDb().collection("chat_preferences").doc(userId).get();
  const data = snapshot.data();
  return {
    data: typeof data?.data === "string" ? (data.data as string) : null,
    updated_at: typeof data?.updated_at === "number" ? (data.updated_at as number) : 0,
  };
}

export async function saveChatPreferences(userId: string, json: string, updatedAt: number) {
  if (json.length > CHAT_PREFS_MAX_CHARS)
    throw new Error("Your chat settings are too large to save.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Your chat settings could not be read.");
  }
  const { normalizePrefs, stripPremiumPresets } = await import("./chat-prefs-model.ts");
  let prefs = normalizePrefs(parsed);
  const access = await getUserMembershipEntitlements(userId);
  if (access.tier === "basic") prefs = stripPremiumPresets(prefs);
  const saved = JSON.stringify(prefs);
  await getFirestoreDb()
    .collection("chat_preferences")
    .doc(userId)
    .set({
      user_id: userId,
      data: saved,
      updated_at: Math.max(0, Math.floor(updatedAt)),
      saved_at: now(),
    });
  return { ok: true as const, data: saved };
}

/** Per-member mute / pin / archive state of one conversation. */
export async function readConversationPreferences(userId: string, conversationId: string) {
  const snapshot = await getFirestoreDb().collection("conversations").doc(conversationId).get();
  const conversation = snapshot.data() as ConversationRecord | undefined;
  if (!snapshot.exists || !conversation?.participant_ids.includes(userId))
    throw new Error("Conversation not found.");
  const preference = conversation.preferences?.[userId] ?? {};
  return {
    archived: preference.archived === true,
    muted: preference.muted === true,
    pinned: preference.pinned === true,
  };
}

export async function saveProfileBio(userId: string, bio: string) {
  const db = getFirestoreDb();
  const normalizedBio = bio.trim();
  await db
    .collection("profiles")
    .doc(userId)
    .set(
      {
        bio: normalizedBio || null,
        updated_at: now(),
      },
      { merge: true },
    );
  return { bio: normalizedBio };
}

export async function listFollowRequests(userId: string) {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection("follows")
    .where("following_id", "==", userId)
    .where("status", "==", "pending")
    .orderBy("created_at", "desc")
    .limit(50)
    .get();
  return Promise.all(
    snapshot.docs.map(async (doc) => {
      const record = doc.data() as { follower_id?: string; created_at?: string };
      if (!record.follower_id) return null;
      const profileSnap = await db.collection("profiles").doc(record.follower_id).get();
      const profile = profileSnap.data() as ProfileRecord | undefined;
      if (
        !profileSnap.exists ||
        profile?.banned ||
        profile?.account_status === "deactivated" ||
        profile?.account_status === "deletion_pending" ||
        !profile?.username
      )
        return null;
      return {
        id: doc.id,
        user_id: record.follower_id,
        username: profile.username,
        photo_url: profile.photo_url ?? null,
        created_at: record.created_at ?? now(),
      };
    }),
  ).then((rows) => rows.filter((row): row is NonNullable<typeof row> => Boolean(row)));
}

export async function respondToFollowRequest(userId: string, followId: string, approve: boolean) {
  const db = getFirestoreDb();
  const ref = db.collection("follows").doc(followId);
  const snap = await ref.get();
  const record = snap.data() as
    { following_id?: string; follower_id?: string; status?: string } | undefined;
  if (!snap.exists || record?.following_id !== userId || record.status !== "pending") {
    throw new Error("That follow request is no longer available.");
  }
  if (approve) {
    await ref.update({ status: "accepted", responded_at: now() });
    return { approved: true };
  }
  await ref.delete();
  return { approved: false };
}

export async function isBlocked(blockerId: string, blockedId: string) {
  const db = getFirestoreDb();
  const snap = await db.collection("blocks").doc(`${blockerId}:${blockedId}`).get();
  return snap.exists;
}

export async function isBlockedBetween(firstId: string, secondId: string) {
  return accountsBlockEachOther(firstId, secondId);
}

async function readAllPairRecords(collection: string, field: string, ids: string[]) {
  const db = getFirestoreDb();
  const records: Array<{ id: string; data: Record<string, any> }> = [];
  let cursor: string | null = null;
  while (true) {
    let query = db.collection(collection).where(field, "in", ids).orderBy("__name__", "asc");
    if (cursor) query = query.startAfter(db.collection(collection).doc(cursor));
    const page = await query.limit(300).get();
    records.push(
      ...page.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, any> })),
    );
    const last = page.docs.at(-1);
    if (page.size < 300 || !last) break;
    cursor = last.id;
  }
  return records;
}

/** Removes follows and the two accounts' reactions/comments on one another's stories. */
async function removePairInteractions(firstId: string, secondId: string) {
  const db = getFirestoreDb();
  const pair = [firstId, secondId];
  const [pairFollows, pairStoryLikes, pairStoryFollows, pairVotes, pairComments, pairCommentLikes] =
    await Promise.all([
      Promise.all([
        db.collection("follows").doc(`${firstId}:${secondId}`).get(),
        db.collection("follows").doc(`${secondId}:${firstId}`).get(),
      ]),
      readAllPairRecords("story_likes", "user_id", pair),
      readAllPairRecords("story_follows", "user_id", pair),
      readAllPairRecords("votes", "user_id", pair),
      readAllPairRecords("comments", "author_id", pair),
      readAllPairRecords("comment_likes", "user_id", pair),
    ]);

  const storyIds = [
    ...new Set(
      [
        ...pairStoryLikes.map((item) => String(item.data["story_id"] ?? "")),
        ...pairStoryFollows.map((item) => String(item.data["story_id"] ?? "")),
        ...pairVotes.map((item) => String(item.data["story_id"] ?? "")),
        ...pairComments.map((item) => String(item.data["story_id"] ?? "")),
      ].filter(Boolean),
    ),
  ];
  const stories = await Promise.all(storyIds.map((id) => db.collection("stories").doc(id).get()));
  const storyById = new Map(
    stories.filter((doc) => doc.exists).map((doc) => [doc.id, doc] as const),
  );
  const parentIds = [
    ...new Set(pairComments.map((item) => String(item.data["parent_id"] ?? "")).filter(Boolean)),
  ];
  const parentDocs = await Promise.all(
    parentIds.map((id) => db.collection("comments").doc(id).get()),
  );
  const parentById = new Map(
    parentDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc] as const),
  );
  const pairSet = new Set(pair);
  const isCounterpart = (actorId: string, ownerId: unknown) =>
    pairSet.has(actorId) && pairSet.has(String(ownerId ?? "")) && actorId !== ownerId;

  const storyLikeDeletes = pairStoryLikes.filter((item) =>
    isCounterpart(
      String(item.data["user_id"] ?? ""),
      storyById.get(String(item.data["story_id"] ?? ""))?.get("author_id"),
    ),
  );
  const storyFollowDeletes = pairStoryFollows.filter((item) =>
    isCounterpart(
      String(item.data["user_id"] ?? ""),
      storyById.get(String(item.data["story_id"] ?? ""))?.get("author_id"),
    ),
  );
  const voteDeletes = pairVotes.filter((item) =>
    isCounterpart(
      String(item.data["user_id"] ?? ""),
      storyById.get(String(item.data["story_id"] ?? ""))?.get("author_id"),
    ),
  );
  const commentsToRemove = pairComments.filter((item) => {
    const ownerId = storyById.get(String(item.data["story_id"] ?? ""))?.get("author_id");
    const parentOwnerId = parentById.get(String(item.data["parent_id"] ?? ""))?.get("author_id");
    return (
      (isCounterpart(String(item.data["author_id"] ?? ""), ownerId) ||
        isCounterpart(String(item.data["author_id"] ?? ""), parentOwnerId)) &&
      !item.data["is_deleted"]
    );
  });
  const removedCommentIds = new Set(commentsToRemove.map((item) => item.id));
  const commentIds = [
    ...new Set(
      [
        ...pairCommentLikes.map((item) => String(item.data["comment_id"] ?? "")),
        ...commentsToRemove.map((item) => item.id),
      ].filter(Boolean),
    ),
  ];
  const commentDocs = await Promise.all(
    commentIds.map((id) => db.collection("comments").doc(id).get()),
  );
  const commentById = new Map(
    commentDocs.filter((doc) => doc.exists).map((doc) => [doc.id, doc] as const),
  );
  const commentLikeDeletes = pairCommentLikes.filter((item) => {
    const comment = commentById.get(String(item.data["comment_id"] ?? ""));
    return (
      removedCommentIds.has(String(item.data["comment_id"] ?? "")) ||
      isCounterpart(String(item.data["user_id"] ?? ""), comment?.get("author_id"))
    );
  });

  const storyMetricDeltas = new Map<
    string,
    {
      likes: number;
      followers: number;
      comments: number;
      upvotes: number;
      metoo: number;
    }
  >();
  const metricFor = (id: string) => {
    if (!storyById.has(id)) return null;
    let metric = storyMetricDeltas.get(id);
    if (!metric) {
      metric = { likes: 0, followers: 0, comments: 0, upvotes: 0, metoo: 0 };
      storyMetricDeltas.set(id, metric);
    }
    return metric;
  };
  for (const item of storyLikeDeletes) {
    const metric = metricFor(String(item.data["story_id"]));
    if (metric) metric.likes -= 1;
  }
  for (const item of storyFollowDeletes) {
    const metric = metricFor(String(item.data["story_id"]));
    if (metric) metric.followers -= 1;
  }
  for (const item of voteDeletes) {
    const metric = metricFor(String(item.data["story_id"]));
    if (metric && item.data["kind"] === "up") metric.upvotes -= 1;
    else if (metric && item.data["kind"] === "metoo") metric.metoo -= 1;
  }
  for (const item of commentsToRemove) {
    if (!item.data["parent_id"]) {
      const metric = metricFor(String(item.data["story_id"]));
      if (metric) metric.comments -= 1;
    }
  }

  const commentLikeCounts = new Map<string, number>();
  for (const item of commentLikeDeletes) {
    const commentId = String(item.data["comment_id"] ?? "");
    commentLikeCounts.set(commentId, (commentLikeCounts.get(commentId) ?? 0) + 1);
  }
  const operations: Array<(batch: ReturnType<typeof db.batch>) => void> = [];
  for (const follow of pairFollows)
    if (follow.exists) operations.push((batch) => batch.delete(follow.ref));
  // Delete interaction docs from their own collections.
  for (const item of storyLikeDeletes)
    operations.push((batch) => batch.delete(db.collection("story_likes").doc(item.id)));
  for (const item of storyFollowDeletes)
    operations.push((batch) => batch.delete(db.collection("story_follows").doc(item.id)));
  for (const item of voteDeletes)
    operations.push((batch) => batch.delete(db.collection("votes").doc(item.id)));
  for (const item of commentLikeDeletes)
    operations.push((batch) => batch.delete(db.collection("comment_likes").doc(item.id)));
  for (const item of commentsToRemove)
    operations.push((batch) =>
      batch.update(db.collection("comments").doc(item.id), {
        body: "",
        likes: 0,
        is_deleted: true,
        counter_adjusted_on_delete: true,
        deleted_at: now(),
      }),
    );
  for (const [storyId, metric] of storyMetricDeltas) {
    const delta: Record<string, ReturnType<typeof FieldValue.increment>> = {};
    if (metric.likes) delta["likes"] = FieldValue.increment(metric.likes);
    if (metric.followers) delta["follower_count"] = FieldValue.increment(metric.followers);
    if (metric.comments) delta["comment_count"] = FieldValue.increment(metric.comments);
    if (metric.upvotes) delta["upvotes"] = FieldValue.increment(metric.upvotes);
    if (metric.metoo) delta["metoo"] = FieldValue.increment(metric.metoo);
    operations.push((batch) => batch.update(db.collection("stories").doc(storyId), delta));
  }
  for (const [commentId, removedLikes] of commentLikeCounts) {
    if (removedCommentIds.has(commentId)) continue;
    const comment = commentById.get(commentId);
    if (comment)
      operations.push((batch) =>
        batch.update(comment.ref, {
          likes: FieldValue.increment(-removedLikes),
        }),
      );
  }
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = db.batch();
    operations.slice(offset, offset + 400).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

export async function toggleBlock(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new Error("You cannot block yourself.");
  if (blockedId === (await getCandidAccountId())) throw new Error("Candid cannot be blocked.");
  const db = getFirestoreDb();
  const profile = await db.collection("profiles").doc(blockedId).get();
  const blockedProfile = profile.data() as ProfileRecord | undefined;
  if (
    !profile.exists ||
    blockedProfile?.banned ||
    blockedProfile?.account_status === "deactivated" ||
    blockedProfile?.account_status === "deletion_pending"
  ) {
    throw new Error("Account unavailable.");
  }
  const ref = db.collection("blocks").doc(`${blockerId}:${blockedId}`);
  const snap = await ref.get();
  if (snap.exists) {
    // If the block was saved but interaction cleanup was interrupted, retry cleanup
    // while keeping the block active. A second tap must never silently unblock it.
    if (snap.get("cleanup_complete") === false) {
      await removePairInteractions(blockerId, blockedId);
      await ref.update({ cleanup_complete: true, cleanup_completed_at: now() });
      return { blocked: true };
    }
    await ref.delete();
    return { blocked: false };
  }
  await ref.set({
    id: ref.id,
    blocker_id: blockerId,
    blocked_id: blockedId,
    created_at: now(),
    cleanup_complete: false,
  });
  await removePairInteractions(blockerId, blockedId);
  await ref.update({ cleanup_complete: true, cleanup_completed_at: now() });
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
  if (senderId === (await getCandidAccountId())) return { allowed: true as const };

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

/** Loads one inbox page without reading the member's full conversation history. */
export async function listConversationPage(
  userId: string,
  limit = 20,
  cursor?: { lastMessageAt: string; id: string } | null,
  archived = false,
) {
  const db = getFirestoreDb();
  let query = db
    .collection("conversations")
    .where("participant_ids", "array-contains", userId)
    .orderBy("last_message_at", "desc")
    .orderBy("__name__", "desc");
  if (cursor) {
    query = query.startAfter(cursor.lastMessageAt, db.collection("conversations").doc(cursor.id));
  }
  const snap = await query.limit(limit + 1).get();
  const pageDocs = snap.docs.slice(0, limit);
  const records = pageDocs.map((doc) => ({ ...(doc.data() as ConversationRecord), id: doc.id }));
  const otherIds = records.map(
    (record) => record.participant_ids.find((id) => id !== userId) ?? userId,
  );
  const participants = await readParticipants(otherIds);
  const items = records
    .map((record) => {
      const otherId = record.participant_ids.find((id) => id !== userId) ?? userId;
      const preference = record.preferences?.[userId] ?? {};
      return {
        id: record.id,
        with: participants.get(otherId)!,
        last_message: record.last_message,
        last_message_at: record.last_message_at,
        unread: record.unread?.[userId] ?? 0,
        mine: record.last_sender_id === userId,
        archived: preference.archived === true,
        muted: preference.muted === true,
        pinned: preference.pinned === true,
        deleted: preference.deleted === true,
      };
    })
    .filter((item) => !item.deleted && item.archived === archived)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
    );
  const last = records.at(-1);
  const hasMore = snap.docs.length > limit;
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? { lastMessageAt: last.last_message_at, id: last.id } : null,
  };
}

export async function applyConversationAction(
  userId: string,
  conversationId: string,
  action: "archive" | "unarchive" | "mute" | "unmute" | "pin" | "unpin" | "delete" | "follow",
) {
  const db = getFirestoreDb();
  const ref = db.collection("conversations").doc(conversationId);
  const snapshot = await ref.get();
  const conversation = snapshot.data() as ConversationRecord | undefined;
  if (!snapshot.exists || !conversation?.participant_ids.includes(userId)) {
    throw new Error("Conversation not found.");
  }
  const otherId = conversation.participant_ids.find((id) => id !== userId);
  if (!otherId) throw new Error("Conversation participant not found.");

  if (action === "follow") {
    const followRef = db.collection("follows").doc(userId + ":" + otherId);
    const existing = await followRef.get();
    if (existing.exists) {
      return {
        ok: true as const,
        following: existing.get("status") !== "pending",
        requested: existing.get("status") === "pending",
      };
    }
    const { toggleAccountFollow } = await import("./social.server");
    return { ok: true as const, ...(await toggleAccountFollow(userId, otherId)) };
  }

  const path = "preferences." + userId;
  const values =
    action === "archive"
      ? { archived: true }
      : action === "unarchive"
        ? { archived: false }
        : action === "mute"
          ? { muted: true }
          : action === "unmute"
            ? { muted: false }
            : action === "pin"
              ? { pinned: true }
              : action === "unpin"
                ? { pinned: false }
                : { deleted: true, archived: false };
  await ref.update({
    ...Object.fromEntries(Object.entries(values).map(([key, value]) => [path + "." + key, value])),
  });
  return { ok: true as const };
}

export async function unreadMessageCount(userId: string) {
  const snap = await getFirestoreDb()
    .collection("conversations")
    .where(`unread.${userId}`, ">", 0)
    .get();
  return snap.docs.reduce((total, doc) => {
    const unread = (doc.data() as ConversationRecord).unread?.[userId] ?? 0;
    return total + Math.max(0, Number(unread));
  }, 0);
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
    // Candid support must remain reachable on every package.
    if (otherId !== CANDID_USER_ID) {
      const membership = await getUserMembershipEntitlements(userId);
      await consumeMembershipQuota(
        userId,
        "new_conversations",
        membership.dailyNewConversations,
        "day",
      );
    }
    const timestamp = now();
    const record: ConversationRecord = {
      id,
      participant_ids: [userId, otherId].sort(),
      created_at: timestamp,
      last_message_at: timestamp,
      activity_at: timestamp,
      last_message: "",
      last_sender_id: null,
      unread: { [userId]: 0, [otherId]: 0 },
    };
    await ref.set(record);
  }
  return { conversation_id: id };
}

/** Resolves a typed handle with one indexed document read, then applies normal chat privacy checks. */
export async function openConversationByUsername(userId: string, rawUsername: string) {
  const username = rawUsername.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9._]{2,19}$/.test(username) || /[._]{2,}/.test(username)) {
    throw new Error("Enter a valid Candid username.");
  }
  const usernameSnap = await getFirestoreDb().collection("usernames").doc(username).get();
  const otherId = (usernameSnap.data() as { user_id?: string } | undefined)?.user_id;
  if (!otherId) throw new Error("We couldn’t find that Candid username.");
  return openConversation(userId, otherId);
}

export async function readConversation(
  userId: string,
  conversationId: string,
  cursor: { createdAt: string; id: string } | null = null,
  knownActivityAt: string | null = null,
): Promise<ConversationView> {
  const db = getFirestoreDb();
  const ref = db.collection("conversations").doc(conversationId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Conversation not found");
  const record = snap.data() as ConversationRecord;
  if (!record.participant_ids.includes(userId)) throw new Error("Not your conversation");

  const activityAt = record.activity_at ?? record.last_message_at;
  const otherId = record.participant_ids.find((id) => id !== userId) ?? userId;
  const blockedBetween = await isBlockedBetween(userId, otherId);
  if (
    !cursor &&
    knownActivityAt &&
    knownActivityAt === activityAt &&
    Number(record.unread?.[userId] ?? 0) === 0
  ) {
    return {
      id: conversationId,
      with: null,
      messages: [],
      unread_cleared: false,
      unchanged: true,
      activity_at: activityAt,
      hasOlder: false,
      nextCursor: null,
      can_send: true,
      blocked_reason: blockedBetween
        ? "This account is blocked. Messages you send here will not be delivered."
        : null,
    };
  }

  let messageQuery = db
    .collection("messages")
    .where("conversation_id", "==", conversationId)
    .orderBy("created_at", "desc")
    .orderBy("__name__", "desc");
  if (cursor) {
    messageQuery = messageQuery.startAfter(
      cursor.createdAt,
      db.collection("messages").doc(cursor.id),
    );
  }
  const [participants, messagesSnap] = await Promise.all([
    readParticipants([otherId]),
    messageQuery.limit(51).get(),
  ]);

  const hasOlder = messagesSnap.size > 50;
  const messages = messagesSnap.docs
    .slice(0, 50)
    .map((doc) => ({ ...(doc.data() as MessageRecord), id: doc.id }))
    .filter((message) => !message.undelivered_to || message.sender_id === userId)
    .reverse();
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
  let latestActivityAt = activityAt;
  if (!cursor) {
    const batch = db.batch();
    let writes = 0;
    if (Number(record.unread?.[userId] ?? 0) > 0) {
      batch.update(ref, { [`unread.${userId}`]: 0 });
      writes += 1;
    }
    for (const message of messages) {
      if (message.sender_id !== userId && !message.read_at) {
        batch.update(db.collection("messages").doc(message.id), { read_at: now() });
        writes += 1;
      }
    }
    if (writes) {
      latestActivityAt = now();
      batch.update(ref, { activity_at: latestActivityAt });
      await batch.commit();
    }
  }

  const gate = cursor
    ? { allowed: true as const, reason: null }
    : blockedBetween
      ? {
          allowed: true as const,
          reason: "This account is blocked. Messages you send here will not be delivered.",
        }
      : await canMessage(userId, otherId);

  return {
    id: conversationId,
    with: participants.get(otherId)!,
    messages: messagesWithImages,
    unread_cleared: !cursor && Number(record.unread?.[userId] ?? 0) > 0,
    unchanged: false,
    activity_at: latestActivityAt,
    hasOlder,
    nextCursor:
      hasOlder && messages[0] ? { createdAt: messages[0].created_at, id: messages[0].id } : null,
    can_send: gate.allowed,
    blocked_reason: blockedBetween
      ? "This account is blocked. Messages you send here will not be delivered."
      : gate.allowed
        ? null
        : gate.reason,
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
  const blockedBetween = await isBlockedBetween(input.userId, otherId);
  const gate = blockedBetween
    ? { allowed: true as const, reason: null }
    : await canMessage(input.userId, otherId);
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
    ...(blockedBetween
      ? { undelivered_to: otherId, delivery_state: "not_delivered" as const }
      : { delivery_state: "sent" as const }),
  };
  const batch = db.batch();
  batch.set(messageRef, message);
  if (!blockedBetween) {
    batch.update(ref, {
      last_message: input.body || (image ? "📷 Image" : ""),
      last_message_at: message.created_at,
      activity_at: message.created_at,
      last_sender_id: input.userId,
      [`unread.${otherId}`]: FieldValue.increment(1),
    });
  }
  if (ticketRef && input.image) {
    batch.update(
      ticketRef,
      { status: "attached", message_id: message.id, attached_at: message.created_at },
      ticketUpdateTime ? { updateTime: ticketUpdateTime } : undefined,
    );
  }
  await batch.commit();

  try {
    if (blockedBetween) return message;
    const [{ dispatchWebPush }, senderSnap] = await Promise.all([
      import("./push.server"),
      db.collection("profiles").doc(input.userId).get(),
    ]);
    const sender = senderSnap.data() as { username?: string | null } | undefined;
    const messagePreview = image
      ? "Sent you a photo"
      : input.body.replace(/\s+/g, " ").trim().slice(0, 180);
    await dispatchWebPush(otherId, {
      title: sender?.username ? `@${sender.username}` : "New message",
      body: messagePreview || "Sent you a message",
      link: `/messages/${input.conversationId}`,
      notificationId: message.id,
    });
  } catch (error) {
    // The message is already saved; push delivery must never make sending fail.
    console.warn(
      "[message push] Could not notify recipient",
      error instanceof Error ? error.message : "unknown error",
    );
  }

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
  const activityAt = now();
  batch.update(
    messageRef,
    {
      body: "",
      image: null,
      reactions: {},
      is_deleted: true,
      deleted_at: activityAt,
    },
    messageSnap.updateTime ? { updateTime: messageSnap.updateTime } : undefined,
  );
  const isLastMessage =
    conversation.last_message_at === message.created_at && conversation.last_sender_id === userId;
  batch.update(conversationRef, {
    activity_at: activityAt,
    ...(isLastMessage ? { last_message: "Message deleted" } : {}),
  });
  await batch.commit();
  if (message.image?.public_id) {
    try {
      const config = getCloudinaryEvidenceConfig();
      const timestamp = String(Math.floor(Date.now() / 1000));
      const params = {
        invalidate: "true",
        public_id: message.image.public_id,
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
      const result = (await response.json().catch(() => ({}))) as { result?: string };
      if (!response.ok || !["ok", "not found"].includes(result.result ?? "")) {
        console.error(
          "Deleted chat message image could not be removed from Cloudinary",
          message.image.public_id,
        );
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
  const addedReaction = !current.includes(userId);
  const batch = db.batch();
  batch.update(ref, {
    [`reactions.${emoji}`]: !addedReaction
      ? FieldValue.arrayRemove(userId)
      : FieldValue.arrayUnion(userId),
  });
  batch.update(conversationSnap.ref, { activity_at: now() });
  await batch.commit();

  if (addedReaction && message.sender_id !== userId) {
    try {
      const [{ pushServerNotification }, actorSnap] = await Promise.all([
        import("./notifications.server"),
        db.collection("profiles").doc(userId).get(),
      ]);
      const actorProfile = actorSnap.data() as
        { username?: string | null; photo_url?: string | null } | undefined;
      const actor = actorProfile?.username ? `@${actorProfile.username}` : "Someone";
      const target = message.image ? "photo" : "message";
      await pushServerNotification({
        userId: message.sender_id,
        kind: "info",
        title: `${actor} reacted to your ${target}`,
        description: emoji,
        link: `/messages/${message.conversation_id}`,
        actor: {
          id: userId,
          username: actorProfile?.username ?? null,
          photoUrl: actorProfile?.photo_url ?? null,
        },
        activityType: "message_reaction",
      });
    } catch (error) {
      // The reaction is already saved; notifying the recipient is best-effort.
      console.warn(
        "[message reaction] Could not notify recipient",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }

  return { ok: true, reacted: addedReaction };
}

/** Public-facing profile used by the chat header and profile detail screen. */
export async function readAccountProfileAvatars(usernames: string[], viewerId: string) {
  const db = getFirestoreDb();
  const uniqueUsernames = [...new Set(usernames.map((username) => username.trim().toLowerCase()))];
  const usernameSnapshots = await Promise.all(
    uniqueUsernames.map((username) => db.collection("usernames").doc(username).get()),
  );
  const entries = usernameSnapshots.flatMap((snapshot, index) => {
    const userId = (snapshot.data() as { user_id?: string } | undefined)?.user_id;
    return userId ? [{ username: uniqueUsernames[index]!, userId }] : [];
  });
  const profiles = await Promise.all(
    entries.map(async ({ username, userId }) => ({
      username,
      userId,
      snapshot: await db.collection("profiles").doc(userId).get(),
    })),
  );
  const availableProfiles = profiles.filter(({ snapshot }) => {
    const profile = snapshot.data() as ProfileRecord | undefined;
    return (
      snapshot.exists &&
      profile &&
      !profile.banned &&
      profile.account_status !== "deactivated" &&
      profile.account_status !== "deletion_pending"
    );
  });
  const visibleProfiles = await Promise.all(
    availableProfiles.map(async ({ username, userId, snapshot }) => ({
      username,
      userId,
      profile: snapshot.data() as ProfileRecord,
      blocked: await accountsBlockEachOther(viewerId, userId),
    })),
  );
  return Object.fromEntries(
    visibleProfiles.flatMap(({ blocked, username, profile }) => {
      const photoURL = profile.photo_url;
      return !blocked && typeof photoURL === "string" ? [[username, photoURL]] : [];
    }),
  );
}

export async function readPublicProfile(username: string, viewerId: string | null) {
  const db = getFirestoreDb();
  const usernameSnap = await db.collection("usernames").doc(username.trim().toLowerCase()).get();
  const userId = (usernameSnap.data() as { user_id?: string } | undefined)?.user_id;
  if (!userId) return null;

  const profileSnap = await db.collection("profiles").doc(userId).get();
  const profile = profileSnap.data() as ProfileRecord | undefined;
  if (
    !profileSnap.exists ||
    !profile ||
    profile.banned ||
    profile.account_status === "deactivated" ||
    profile.account_status === "deletion_pending"
  )
    return null;
  if (viewerId && viewerId !== userId && (await accountsBlockEachOther(viewerId, userId)))
    return null;
  const pinnedLimit = getMembershipEntitlements(
    getEffectiveMembershipTier(profile),
  ).maxPinnedStories;
  const requestedPinIds = Array.isArray(profile.pinned_story_ids)
    ? [
        ...new Set(profile.pinned_story_ids.filter((id): id is string => typeof id === "string")),
      ].slice(0, pinnedLimit)
    : [];

  const [
    participants,
    allFollowers,
    allFollowing,
    pendingFollowers,
    pendingFollowing,
    profileFollowsViewer,
    viewerFollowsProfile,
  ] = await Promise.all([
    readParticipants([userId]),
    db.collection("follows").where("following_id", "==", userId).count(),
    db.collection("follows").where("follower_id", "==", userId).count(),
    db
      .collection("follows")
      .where("following_id", "==", userId)
      .where("status", "==", "pending")
      .count(),
    db
      .collection("follows")
      .where("follower_id", "==", userId)
      .where("status", "==", "pending")
      .count(),
    viewerId ? db.collection("follows").doc(`${userId}:${viewerId}`).get() : Promise.resolve(null),
    viewerId ? db.collection("follows").doc(`${viewerId}:${userId}`).get() : Promise.resolve(null),
  ]);
  const followerCount = Math.max(0, allFollowers - pendingFollowers);
  const followingCount = Math.max(0, allFollowing - pendingFollowing);
  const viewerFollowStatus = !viewerFollowsProfile?.exists
    ? "none"
    : viewerFollowsProfile.get("status") === "pending"
      ? "pending"
      : "accepted";
  const isSelf = viewerId === userId;
  const isPrivate = profile.profile_visibility === "private";
  const canViewContributions = !isPrivate || isSelf || viewerFollowStatus === "accepted";
  const [storyCount, commentCount, anonymousStoryCount, anonymousCommentCount, stories] =
    canViewContributions
      ? await Promise.all([
          db
            .collection("stories")
            .where("author_id", "==", userId)
            .where("status", "==", "published")
            .count(),
          db
            .collection("comments")
            .where("author_id", "==", userId)
            .where("status", "==", "published")
            .count(),
          db
            .collection("stories")
            .where("author_id", "==", userId)
            .where("status", "==", "published")
            .where("is_anonymous", "==", true)
            .count(),
          db
            .collection("comments")
            .where("author_id", "==", userId)
            .where("status", "==", "published")
            .where("is_anonymous", "==", true)
            .count(),
          db
            .collection("stories")
            .where("author_id", "==", userId)
            .where("status", "==", "published")
            .orderBy("created_at", "desc")
            .orderBy("__name__", "desc")
            .limit(31)
            .get(),
        ])
      : [0, 0, 0, 0, null];
  const storyDocs = stories?.docs ?? [];
  const storySize = stories?.size ?? 0;
  const newestStoryDocsById = new Map(storyDocs.map((doc) => [doc.id, doc] as const));
  const profileStories = await Promise.all(
    storyDocs
      .filter((doc) => doc.get("is_anonymous") !== true)
      .slice(0, 30)
      .map((doc) => publicProfileStory(doc.id, doc.data() as StoryRecord, doc.updateTime)),
  );
  const profileStoriesById = new Map(profileStories.map((story) => [story.id, story] as const));
  const pinnedStoryDocs = canViewContributions
    ? await Promise.all(
        requestedPinIds.map(
          async (storyId) =>
            newestStoryDocsById.get(storyId) ?? (await db.collection("stories").doc(storyId).get()),
        ),
      )
    : [];
  const pinnedStories = await Promise.all(
    pinnedStoryDocs
      .filter((doc) => doc.exists)
      .map(async (doc) => {
        const story = doc.data() as StoryRecord;
        if (story.author_id !== userId || story.status !== "published" || story.is_anonymous)
          return null;
        const alreadyLoaded = profileStoriesById.get(doc.id);
        if (alreadyLoaded) return { ...alreadyLoaded, is_pinned: true };
        return publicProfileStory(doc.id, story, doc.updateTime, true);
      }),
  );
  const visiblePinnedStories = pinnedStories.filter((story): story is NonNullable<typeof story> =>
    Boolean(story),
  );
  const messaging =
    viewerId && viewerId !== userId
      ? await canMessage(viewerId, userId)
      : { allowed: false as const, reason: null };
  return {
    ...participants.get(userId)!,
    bio: profile?.bio ?? null,
    role_label: profile?.role_label ?? null,
    account_type: profile?.account_type ?? "unknown",
    photo_url: profile?.photo_url ?? null,
    cover_url: profile?.cover_url ?? null,
    county: profile?.county ?? null,
    socials: profile?.socials ?? null,
    profile_visibility: profile.profile_visibility ?? "public",
    is_private: isPrivate,
    can_view_contributions: canViewContributions,
    followers: followerCount,
    following: followingCount,
    contributions: {
      stories: Math.max(0, storyCount - anonymousStoryCount),
      comments: Math.max(0, commentCount - anonymousCommentCount),
      joined_at: profile?.onboarded_at ?? profile?.created_at ?? null,
    },
    pinnedStoryIds: visiblePinnedStories.map((story) => story.id),
    pinnedStories: visiblePinnedStories,
    stories: profileStories,
    storiesHasMore: storySize > 30,
    storiesCursor:
      storySize > 30 && storyDocs[29]
        ? {
            createdAt: String(storyDocs[29]!.get("created_at") ?? ""),
            id: storyDocs[29]!.id,
          }
        : null,
    isFollowing: viewerFollowStatus === "accepted",
    followStatus: viewerFollowStatus,
    isBlocked: viewerId ? await isBlocked(viewerId, userId) : false,
    followsYou: Boolean(
      profileFollowsViewer?.exists && profileFollowsViewer.get("status") !== "pending",
    ),
    messaging: { allowed: messaging.allowed, reason: messaging.allowed ? null : messaging.reason },
    isSelf,
  };
}

async function publicProfileStory(
  id: string,
  story: StoryRecord,
  updateTime?: string,
  isPinned = false,
) {
  const commentCount = await getTopLevelCommentCount(story, updateTime);
  return {
    id,
    title: story.title,
    body: story.body,
    company_name: story.company_name,
    county: story.county,
    area: story.area ?? null,
    created_at: story.created_at,
    comment_count: commentCount,
    likes: Number(story.likes ?? 0),
    post_type: story.post_type ?? "workplace_story",
    media: story.media ?? [],
    is_pinned: isPinned,
  };
}

/** Loads additional public stories without repeating profile counts and social-stat reads. */
export async function readPublicProfileStories(
  username: string,
  cursor: { createdAt: string; id: string } | null,
  viewerId: string | null,
) {
  const db = getFirestoreDb();
  const usernameSnap = await db.collection("usernames").doc(username.trim().toLowerCase()).get();
  const userId = (usernameSnap.data() as { user_id?: string } | undefined)?.user_id;
  if (!userId) return { stories: [], hasMore: false, nextCursor: null };

  const profileSnap = await db.collection("profiles").doc(userId).get();
  const profile = profileSnap.data() as ProfileRecord | undefined;
  if (
    !profileSnap.exists ||
    profile?.banned ||
    profile?.account_status === "deactivated" ||
    profile?.account_status === "deletion_pending"
  )
    return { stories: [], hasMore: false, nextCursor: null };
  if (viewerId && viewerId !== userId && (await accountsBlockEachOther(viewerId, userId))) {
    return { stories: [], hasMore: false, nextCursor: null };
  }
  if (profile?.profile_visibility === "private" && viewerId !== userId) {
    const follow = viewerId
      ? await db.collection("follows").doc(`${viewerId}:${userId}`).get()
      : null;
    if (!follow?.exists || follow.get("status") === "pending") {
      return { stories: [], hasMore: false, nextCursor: null };
    }
  }

  let query = db
    .collection("stories")
    .where("author_id", "==", userId)
    .where("status", "==", "published")
    .orderBy("created_at", "desc")
    .orderBy("__name__", "desc");
  if (cursor) {
    query = query.startAfter(cursor.createdAt, db.collection("stories").doc(cursor.id));
  }
  const snapshot = await query.limit(31).get();
  const docs = snapshot.docs.slice(0, 30);
  const last = docs.at(-1);
  return {
    stories: await Promise.all(
      docs
        .filter((doc) => doc.get("is_anonymous") !== true)
        .map((doc) => publicProfileStory(doc.id, doc.data() as StoryRecord, doc.updateTime)),
    ),
    hasMore: snapshot.size > 30,
    nextCursor:
      snapshot.size > 30 && last
        ? { createdAt: String(last.get("created_at") ?? ""), id: last.id }
        : null,
  };
}

/** Cursor-paged public follower directory. Each request reads one bounded page. */
export async function readPublicProfileFollowers(
  username: string,
  cursor: string | null,
  viewerId: string,
) {
  const db = getFirestoreDb();
  const usernameSnap = await db.collection("usernames").doc(username.trim().toLowerCase()).get();
  const userId = (usernameSnap.data() as { user_id?: string } | undefined)?.user_id;
  if (!userId) return { followers: [], hasMore: false, nextCursor: null };

  const profileSnap = await db.collection("profiles").doc(userId).get();
  const profile = profileSnap.data() as ProfileRecord | undefined;
  if (
    !profileSnap.exists ||
    profile?.banned ||
    profile?.account_status === "deactivated" ||
    profile?.account_status === "deletion_pending"
  )
    return { followers: [], hasMore: false, nextCursor: null };
  if (viewerId !== userId && (await accountsBlockEachOther(viewerId, userId))) {
    return { followers: [], hasMore: false, nextCursor: null };
  }

  let query = db
    .collection("follows")
    .where("following_id", "==", userId)
    .orderBy("__name__", "asc");
  if (cursor) query = query.startAfter(db.collection("follows").doc(cursor));

  const pageSize = 24;
  const snapshot = await query.limit(pageSize + 1).get();
  const pageDocs = snapshot.docs.slice(0, pageSize);
  const profiles = await Promise.all(
    pageDocs.map(async (followDoc) => {
      const followerId = (followDoc.data() as { follower_id?: string }).follower_id;
      if (!followerId) return null;
      const followerSnap = await db.collection("profiles").doc(followerId).get();
      const follower = followerSnap.data() as ProfileRecord | undefined;
      if (!followerSnap.exists || follower?.banned || !follower?.username) return null;
      return {
        id: followerId,
        username: follower.username,
        photo_url: follower.photo_url ?? null,
      };
    }),
  );
  const last = pageDocs.at(-1);
  const hasMore = snapshot.size > pageSize;
  return {
    followers: profiles.filter((follower): follower is NonNullable<typeof follower> =>
      Boolean(follower),
    ),
    hasMore,
    nextCursor: hasMore && last ? last.id : null,
  };
}
