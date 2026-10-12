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
    };
  });

export const createMyPaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ tier: z.enum(["premium", "gold"]), renewal: z.boolean().default(false) }).parse(input))
  .handler(async ({ data, context }) => {
    const { createManualPaymentRequest } = await import("./billing.server");
    return createManualPaymentRequest(context.userId, data.tier, data.renewal);
  });

export const submitMyPayment = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) => z.object({
    paymentId: z.string().uuid(),
    transactionCode: z.string().trim().min(8).max(12),
    payerPhone: z.string().trim().max(20).nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { submitManualPayment } = await import("./billing.server");
    return submitManualPayment(context.userId, data.paymentId, data.transactionCode, data.payerPhone ?? null);
  });

export const requestMyBasicDowngrade = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .handler(async ({ context }) => {
    const { requestBasicDowngrade } = await import("./billing.server");
    return requestBasicDowngrade(context.userId);
  });

