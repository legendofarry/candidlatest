import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

export const downloadAccountExport = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { buildAccountExport } = await import("./account-export.server");
    return buildAccountExport(context.userId);
  });
