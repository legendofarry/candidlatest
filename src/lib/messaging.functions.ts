import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

const attachmentSchema = z
  .object({
    url: z.string().min(1),
    name: z.string().min(1),
    kind: z.enum(["image", "file"]),
  })
  .nullable()
  .default(null);

export const getConversations = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { listConversations, ensureCandidAccount } = await import("./messaging.server");
    await ensureCandidAccount();
    return listConversations(context.userId);
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

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversation_id: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { readConversation } = await import("./messaging.server");
    return readConversation(context.userId, data.conversation_id);
  });

export const postMessage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversation_id: z.string().min(1),
        body: z.string().max(4000).default(""),
        attachment: attachmentSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { sendMessage } = await import("./messaging.server");
    if (!data.body.trim() && !data.attachment) throw new Error("Write something first.");
    return sendMessage({
      userId: context.userId,
      conversationId: data.conversation_id,
      body: data.body.trim(),
      attachment: data.attachment,
    });
  });

export const reactToMessage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ message_id: z.string().min(1), emoji: z.string().min(1).max(8) }).parse(input),
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
    z.object({ who_can_message: z.enum(["everyone", "followers", "nobody"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { savePrivacySettings } = await import("./messaging.server");
    return savePrivacySettings(context.userId, data.who_can_message);
  });

export const toggleBlockAccount = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { toggleBlock } = await import("./messaging.server");
    return toggleBlock(context.userId, data.user_id);
  });

export const getPublicProfile = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ username: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { readPublicProfile } = await import("./messaging.server");
    return readPublicProfile(data.username, context.userId);
  });
