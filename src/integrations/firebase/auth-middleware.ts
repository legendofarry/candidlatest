import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase.server";
import { DEFAULT_MEMBERSHIP } from "@/lib/membership";

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authHeader = request?.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Unauthorized: No Firebase bearer token provided");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      throw new Error("Unauthorized: Empty Firebase bearer token");
    }

    const decoded = await getFirebaseAuth().verifyIdToken(token);
    if (!decoded.uid) {
      throw new Error("Unauthorized: Firebase token missing uid");
    }
    if (!decoded.email || decoded.email_verified !== true) {
      throw new Error("Email verification required. Open /verify-email to continue.");
    }

    const db = getFirestoreDb();
    const profile = await db.collection("profiles").doc(decoded.uid).get();
    const profileData = profile.data() as {
      banned?: boolean;
      investigation_hold?: boolean | { active?: boolean } | null;
      subscription_tier?: string;
      subscription_status?: string;
    } | undefined;
    if (profileData?.banned) {
      throw new Error("This account has been restricted.");
    }
    const investigationHold = profileData?.investigation_hold;
    if (investigationHold === true || (typeof investigationHold === "object" && investigationHold?.active)) {
      throw new Error("ACCOUNT_INVESTIGATION_HOLD");
    }
    if (!profileData?.subscription_tier || !profileData.subscription_status) {
      await db.collection("profiles").doc(decoded.uid).set({
        id: decoded.uid,
        subscription_tier: profileData?.subscription_tier || DEFAULT_MEMBERSHIP.subscription_tier,
        subscription_status: profileData?.subscription_status || DEFAULT_MEMBERSHIP.subscription_status,
        subscription_provider: DEFAULT_MEMBERSHIP.subscription_provider,
        subscription_started_at: DEFAULT_MEMBERSHIP.subscription_started_at,
        subscription_period_ends_at: DEFAULT_MEMBERSHIP.subscription_period_ends_at,
      }, { merge: true });
    }

    return next({
      context: {
        db,
        userId: decoded.uid,
        claims: decoded,
      },
    });
  },
);

/** Explicit marker for actions that publish or endorse community content. */
export const requireVerifiedFirebaseAuth = createMiddleware({ type: "function" })
  .middleware([requireFirebaseAuth])
  .server(async ({ next, context }) => {
    if (!context.claims.email || context.claims["email_verified"] !== true) {
      throw new Error("Verify your email before contributing. Open /verify-email to continue.");
    }

    return next();
  });
