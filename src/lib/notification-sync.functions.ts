import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

/** Pulls the signed-in user's durable server notifications for local inbox merge. */
export const syncMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(50).default(20),
        cursor: z.object({ createdAt: z.string(), id: z.string() }).nullable().default(null),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { listServerNotifications } = await import("./notifications.server");
    const page = await listServerNotifications(context.userId, data.limit, data.cursor);
    return {
      items: page.items.map((item) => ({
        id: item.id,
        category: item.category ?? "activity",
        kind: item.kind,
        title: item.title,
        description: item.description ?? undefined,
        actor:
          item.actor_id || item.actor_username || item.actor_photo_url
            ? {
                id: item.actor_id ?? "",
                username: item.actor_username ?? undefined,
                photoUrl: item.actor_photo_url ?? undefined,
              }
            : undefined,
        activityType: item.activity_type ?? "other",
        link: item.link ?? undefined,
        createdAt: new Date(item.created_at).getTime(),
      })),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  });
