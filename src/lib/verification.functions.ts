import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

/** Resolves account type + badge eligibility for the signed-in user. */
export const getVerificationState = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { resolveVerification } = await import("./verification.server");
    const claims = context.claims as { email?: string; email_verified?: boolean };
    const record = await resolveVerification(
      context.userId,
      claims.email ?? null,
      Boolean(claims.email_verified),
    );
    const snoozed = record.snoozed_until
      ? new Date(record.snoozed_until).getTime() > Date.now()
      : false;
    return {
      accountType: record.account_type,
      badgeStatus: record.badge_status,
      companyName: record.company_name,
      companySlug: record.company_slug,
      ownerVerified: record.owner_verified,
      approvalStatus: record.approval_status ?? "none",
      snoozed,
      canClaim: record.badge_status === "eligible" && record.approval_status !== "pending_review",
      showPrompt: record.badge_status === "eligible" && record.approval_status !== "pending_review" && !snoozed,
    };
  });

export const claimVerificationBadge = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { claimBadge } = await import("./verification.server");
    const claims = context.claims as { email?: string; email_verified?: boolean };
    return claimBadge(context.userId, claims.email ?? null, Boolean(claims.email_verified));
  });

export const snoozeVerificationPrompt = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { snoozeBadgePrompt } = await import("./verification.server");
    return snoozeBadgePrompt(context.userId, 24);
  });
