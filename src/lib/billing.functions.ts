import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth, requireVerifiedFirebaseAuth } from "@/integrations/firebase/auth-middleware";

export const getMyBilling = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { getMyBillingSummary, readBillingConfig } = await import("./billing.server");
    const [summary, config] = await Promise.all([getMyBillingSummary(context.userId), readBillingConfig()]);
    return {
      ...summary,
      packages: config.packages,
      paymentConfigured: config.manual_mpesa.enabled && Boolean(config.manual_mpesa.business_number && config.manual_mpesa.mode),
      paymentDetails: config.manual_mpesa,
    };
  });

export const createMyPaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ tier: z.literal("premium"), renewal: z.boolean().default(false) }).parse(input))
  .handler(async ({ data, context }) => {
    const { createManualPaymentRequest } = await import("./billing.server");
    return createManualPaymentRequest(context.userId, data.tier, data.renewal);
  });

export const issueMyPaymentProofUpload = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) => z.object({
    paymentId: z.string().uuid(),
    size: z.number().int().positive().max(5 * 1024 * 1024),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { issuePaymentProofUpload } = await import("./billing.server");
    return issuePaymentProofUpload(context.userId, data.paymentId, data.size, data.mimeType);
  });

export const submitMyPayment = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) => z.object({
    paymentId: z.string().uuid(),
    transactionCode: z.string().trim().max(12).nullable().optional(),
    payerPhone: z.string().trim().max(20).nullable().optional(),
    proof: z.object({
      ticketId: z.string().uuid(),
      publicId: z.string().min(1).max(300),
      version: z.number().int().positive(),
      signature: z.string().min(40).max(64),
      format: z.enum(["jpg", "png", "webp"]),
      bytes: z.number().int().positive().max(5 * 1024 * 1024),
      type: z.literal("authenticated"),
    }),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { submitManualPayment } = await import("./billing.server");
    return submitManualPayment(context.userId, data.paymentId, data.transactionCode ?? null, data.payerPhone ?? null, data.proof);
  });

export const cancelMyPaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { cancelManualPaymentRequest } = await import("./billing.server");
    return cancelManualPaymentRequest(context.userId, data.paymentId);
  });

export const requestMyBasicDowngrade = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .handler(async ({ context }) => {
    const { requestBasicDowngrade } = await import("./billing.server");
    return requestBasicDowngrade(context.userId);
  });

