import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase.server";

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

    const db = getFirestoreDb();
    const profile = await db.collection("profiles").doc(decoded.uid).get();
    if (profile.exists && (profile.data() as { banned?: boolean }).banned) {
      throw new Error("This account has been restricted.");
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

/** Require a verified email for actions that publish or endorse community content. */
export const requireVerifiedFirebaseAuth = createMiddleware({ type: "function" })
  .middleware([requireFirebaseAuth])
  .server(async ({ next, context }) => {
    // Firebase marks verified Google addresses as verified in the ID token.
    // Accounts with no email cannot receive a verification link, so they pass.
    if (context.claims.email && context.claims["email_verified"] !== true) {
      throw new Error("Verify your email before contributing. Open /verify-email to continue.");
    }

    return next();
  });
