import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

export const registerMyPushToken = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(40).max(4096) }).parse(input))
  .handler(async ({ data, context }) => {
    const { registerPushToken } = await import("./push.server");
    const userAgent = (await import("@tanstack/react-start/server")).getRequest()?.headers.get("user-agent") ?? null;
    return registerPushToken(context.userId, data.token, userAgent);
  });

export const unregisterMyPushToken = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(40).max(4096) }).parse(input))
  .handler(async ({ data, context }) => {
    const { removePushToken } = await import("./push.server");
    return removePushToken(context.userId, data.token);
  });

/** Sends a one-off test alert to this member's registered browser/app devices. */
export const sendMyPushTestNotification = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { dispatchWebPush } = await import("./push.server");
    return dispatchWebPush(context.userId, {
      title: "Candid test notification",
      body: "Push notifications are reaching your device.",
      link: "/settings",
      notificationId: `push-test-${Date.now()}`,
    });
  });
