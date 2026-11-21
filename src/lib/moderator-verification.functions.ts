import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth, requireVerifiedFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import {
  discardModeratorEvidenceUpload,
  getMyModeratorIdentityStatus,
  issueModeratorEvidenceUpload,
  listPendingModeratorIdentityReviews,
  reviewModeratorIdentity,
  submitModeratorIdentityEvidence,
} from "./moderator-verification.server";

const slotSchema = z.enum(["id_front", "id_back", "selfie", "payslip"]);
const receiptSchema = z.object({
  ticket_id: z.string().uuid(),
  slot: slotSchema,
  public_id: z.string().min(1).max(240),
  version: z.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{40,64}$/i),
  format: z.enum(["jpg", "png", "webp"]),
  bytes: z.number().int().positive().max(8 * 1024 * 1024),
});

export const getMyModeratorIdentityStatusAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(({ context }) => getMyModeratorIdentityStatus(context.userId));

export const issueModeratorEvidenceUploadAction = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) => z.object({
    slot: slotSchema,
    size: z.number().int().positive().max(8 * 1024 * 1024),
    mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  }).parse(input))
  .handler(({ data, context }) => issueModeratorEvidenceUpload({
    userId: context.userId,
    slot: data.slot,
    size: data.size,
    mimeType: data.mime_type,
  }));

export const discardModeratorEvidenceUploadAction = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ ticket_id: z.string().uuid() }).parse(input))
  .handler(({ data, context }) => discardModeratorEvidenceUpload(context.userId, data.ticket_id));

export const submitModeratorIdentityEvidenceAction = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ receipts: z.array(receiptSchema).min(2).max(3) }).parse(input))
  .handler(({ data, context }) => submitModeratorIdentityEvidence(context.userId, data.receipts));

export const listPendingModeratorIdentityReviewsAction = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .handler(({ context }) => listPendingModeratorIdentityReviews(context.userId));

export const reviewModeratorIdentityAction = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) => z.object({
    user_id: z.string().min(1).max(160),
    decision: z.enum(["approve", "decline"]),
    note: z.string().max(1000).default(""),
  }).parse(input))
  .handler(({ data, context }) => reviewModeratorIdentity({
    actorId: context.userId,
    userId: data.user_id,
    decision: data.decision,
    note: data.note,
  }));
