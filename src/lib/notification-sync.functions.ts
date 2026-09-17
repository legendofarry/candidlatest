import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

/** Pulls the signed-in user's durable server notifications for local inbox merge. */
export const syncMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { listServerNotifications } = await import("./notifications.server");
    const items = await listServerNotifications(context.userId, 30);
    return items.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      description: item.description ?? undefined,
      link: item.link ?? undefined,
      createdAt: new Date(item.created_at).getTime(),
    }));
  });
