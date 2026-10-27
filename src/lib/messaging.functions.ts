import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalFirebaseAuth, requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

export const getConversations = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(50).default(20),
        cursor: z.object({ lastMessageAt: z.string(), id: z.string() }).nullable().default(null),
        archived: z.boolean().default(false),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { listConversationPage } = await import("./messaging.server");
    return listConversationPage(context.userId, data.limit, data.cursor, data.archived);
  });

export const updateConversationPreference = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({
    conversation_id: z.string().min(1),
    action: z.enum(["archive", "unarchive", "mute", "unmute", "pin", "unpin", "delete", "follow"]),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const { applyConversationAction } = await import("./messaging.server");
    return applyConversationAction(context.userId, data.conversation_id, data.action);
  });

export const getUnreadMessages = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { unreadMessageCount } = await import("./messaging.server");
    return { unread: await unreadMessageCount(context.userId) };
  });

export const startConversation = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { openConversation } = await import("./messaging.server");
    return openConversation(context.userId, data.user_id);
  });

export const startConversationByUsername = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ username: z.string().trim().min(3).max(21) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { openConversationByUsername } = await import("./messaging.server");
    return openConversationByUsername(context.userId, data.username);
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversation_id: z.string().min(1),
        cursor: z.object({ createdAt: z.string(), id: z.string() }).nullable().default(null),
        known_activity_at: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { readConversation } = await import("./messaging.server");
    return readConversation(
      context.userId,
      data.conversation_id,
      data.cursor,
      data.known_activity_at ?? null,
    );
  });

export const postMessage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversation_id: z.string().min(1),
        body: z.string().max(4000).default(""),
        image: z
          .object({
            ticket_id: z.string().uuid(),
            public_id: z.string().min(1).max(255),
            version: z.number().int().positive(),
            signature: z.string().regex(/^[a-f0-9]{40,64}$/i),
            format: z.enum(["jpg", "png", "webp"]),
            bytes: z
              .number()
              .int()
              .positive()
              .max(8 * 1024 * 1024),
          })
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { sendMessage } = await import("./messaging.server");
    if (!data.body.trim() && !data.image) throw new Error("Write a message or attach an image.");
    return sendMessage({
      userId: context.userId,
      conversationId: data.conversation_id,
      body: data.body.trim(),
      image: data.image ?? null,
    });
  });

export const deleteChatMessage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ message_id: z.string().min(1).max(180) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { deleteMessage } = await import("./messaging.server");
    return deleteMessage(context.userId, data.message_id);
  });

export const issueChatImageUpload = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversation_id: z.string().min(1),
        size: z
          .number()
          .int()
          .positive()
          .max(8 * 1024 * 1024),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { issueChatImageUpload: issue } = await import("./messaging.server");
    return issue({
      userId: context.userId,
      conversationId: data.conversation_id,
      size: data.size,
      mimeType: data.mimeType,
    });
  });

export const discardChatImageUpload = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ ticket_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { discardChatImageUpload: discard } = await import("./messaging.server");
    return discard(context.userId, data.ticket_id);
  });

export const reactToMessage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        message_id: z.string().min(1),
        emoji: z.enum(["❤️", "😂", "😮", "😢", "🔥", "👏", "👍", "🙏"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { toggleReaction } = await import("./messaging.server");
    return toggleReaction(context.userId, data.message_id, data.emoji);
  });

export const getPrivacySettings = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { readPrivacySettings, listBlocked } = await import("./messaging.server");
    const [settings, blocked] = await Promise.all([
      readPrivacySettings(context.userId),
      listBlocked(context.userId),
    ]);
    return { ...settings, blocked };
  });

export const updatePrivacySettings = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      who_can_message: z.enum(["everyone", "followers", "nobody"]).optional(),
      profile_visibility: z.enum(["public", "private"]).optional(),
    }).refine((data) => data.who_can_message || data.profile_visibility, "Choose a privacy setting.").parse(input),
  )
  .handler(async ({ data, context }) => {
    const { savePrivacySettings } = await import("./messaging.server");
    return savePrivacySettings(context.userId, {
      whoCanMessage: data.who_can_message,
      profileVisibility: data.profile_visibility,
    });
  });

export const getFollowRequests = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { listFollowRequests } = await import("./messaging.server");
    return { requests: await listFollowRequests(context.userId) };
  });

export const respondToFollowRequest = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ follow_id: z.string().min(1), approve: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const { respondToFollowRequest: respond } = await import("./messaging.server");
    return respond(context.userId, data.follow_id, data.approve);
  });

export const toggleBlockAccount = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { toggleBlock } = await import("./messaging.server");
    return toggleBlock(context.userId, data.user_id);
  });

export const getPublicProfile = createServerFn({ method: "POST" })
  .middleware([optionalFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ username: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { readPublicProfile } = await import("./messaging.server");
    return readPublicProfile(data.username, context.userId);
  });

export const getPublicProfileStories = createServerFn({ method: "POST" })
  .middleware([optionalFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        username: z.string().trim().min(1).max(32),
        cursor: z.object({ createdAt: z.string(), id: z.string() }).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { readPublicProfileStories } = await import("./messaging.server");
    return readPublicProfileStories(data.username, data.cursor, context.userId);
  });

export const getPublicProfileFollowers = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        username: z.string().trim().min(1).max(32),
        cursor: z.string().min(1).max(200).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { readPublicProfileFollowers } = await import("./messaging.server");
    return readPublicProfileFollowers(data.username, data.cursor);
  });

/** Small, authenticated lookup used by the @mention picker. */
export const getMentionSuggestions = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().toLowerCase().min(2).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = (await import("./firebase.server")).getFirestoreDb();
    const { canMessage } = await import("./messaging.server");
    const snapshot = await db
      .collection("profiles")
      .where("username", ">=", data.query)
      .where("username", "<=", `${data.query}\uf8ff`)
      .orderBy("username")
      .limit(9)
      .get();

    const users: Array<{ username: string; photoUrl: string | null }> = [];
    for (const doc of snapshot.docs) {
      if (doc.id === context.userId) continue;
      if (doc.get("banned") === true) continue;
      if (["deactivated", "deletion_pending", "deletion_in_progress"].includes(String(doc.get("account_status") ?? "active"))) {
        continue;
      }
      const username = doc.get("username");
      if (typeof username !== "string") continue;
      const gate = await canMessage(context.userId, doc.id);
      if (!gate.allowed) continue;
      users.push({ username, photoUrl: doc.get("photo_url") ?? null });
      if (users.length >= 8) break;
    }

    return { users };
  });
