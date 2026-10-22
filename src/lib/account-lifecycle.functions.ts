import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAccountLifecycleAuth } from "@/integrations/firebase/account-lifecycle-middleware";

export const getMyAccountLifecycle = createServerFn({ method: "POST" })
  .middleware([requireAccountLifecycleAuth])
  .handler(async ({ context }) => {
    const { readMyAccountLifecycle } = await import("./account-lifecycle.server");
    return readMyAccountLifecycle(context.userId);
  });

export const changeMyAccountLifecycle = createServerFn({ method: "POST" })
  .middleware([requireAccountLifecycleAuth])
  .inputValidator((input: unknown) => z.object({ action: z.enum(["delete", "deactivate", "reactivate"]) }).parse(input))
  .handler(async ({ context, data }) => {
    const { changeAccountLifecycle } = await import("./account-lifecycle.server");
    return changeAccountLifecycle(context.userId, data.action);
  });
