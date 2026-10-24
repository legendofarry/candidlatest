import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

export const startCall = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ conversation_id: z.string().min(1), media: z.enum(["audio", "video"]) }).parse(input))
  .handler(async ({ context, data }) => {
    const { startCall: start } = await import("./calls.server");
    return start(context.userId, data.conversation_id, data.media);
  });

export const respondToCall = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ call_id: z.string().min(1), response: z.enum(["accept", "decline"]) }).parse(input))
  .handler(async ({ context, data }) => {
    const { respondToCall: respond } = await import("./calls.server");
    return respond(context.userId, data.call_id, data.response);
  });

export const approveCallJoin = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ call_id: z.string().min(1), requester_id: z.string().min(1) }).parse(input))
  .handler(async ({ context, data }) => {
    const { approveJoinRequest } = await import("./calls.server");
    return approveJoinRequest(context.userId, data.call_id, data.requester_id);
  });

export const cancelCallJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ call_id: z.string().min(1) }).parse(input))
  .handler(async ({ context, data }) => {
    const { cancelJoinRequest } = await import("./calls.server");
    return cancelJoinRequest(context.userId, data.call_id);
  });

export const inviteToCall = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ call_id: z.string().min(1), username: z.string().trim().min(3).max(21) }).parse(input))
  .handler(async ({ context, data }) => {
    const { inviteToCall: invite } = await import("./calls.server");
    return invite(context.userId, data.call_id, data.username);
  });

export const finishCall = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ call_id: z.string().min(1) }).parse(input))
  .handler(async ({ context, data }) => {
    const { endCall } = await import("./calls.server");
    return endCall(context.userId, data.call_id);
  });

export const heartbeatCall = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ call_id: z.string().min(1) }).parse(input))
  .handler(async ({ context, data }) => {
    const { heartbeatCall: heartbeat } = await import("./calls.server");
    return heartbeat(context.userId, data.call_id);
  });
