import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

export const switchMyMembership = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ tier: z.enum(["basic", "premium", "gold"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { switchMembership } = await import("./membership.server");
    return switchMembership(context.userId, data.tier);
  });
