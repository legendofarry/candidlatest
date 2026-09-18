import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

const ticketSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  contact: z.string().trim().min(3).max(160),
  category: z.enum(["story", "account", "privacy", "employer", "technical", "other"]),
  message: z.string().trim().min(10).max(4000),
});

export const createSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ticketSchema.parse(input))
  .handler(async ({ data }) => {
    const { createTicket } = await import("./support.server");
    return createTicket(data);
  });

export const getSupportConversation = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { readSupportConversation } = await import("./support.server");
    return readSupportConversation(context.userId);
  });

export const sendSupportMessage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ body: z.string().trim().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { writeSupportMessage } = await import("./support.server");
    return writeSupportMessage(context.userId, data.body);
  });
