import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getFirebaseAuth } from "@/lib/firebase.server";

/** Authenticates account recovery actions without requiring the profile to be active. */
export const requireAccountLifecycleAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const authHeader = getRequest()?.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Sign in to manage this account.");
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) throw new Error("Sign in to manage this account.");
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    if (!decoded.uid || !decoded.email || decoded["email_verified"] !== true) {
      throw new Error("Verify your email before changing account status.");
    }
    return next({ context: { userId: decoded.uid } });
  },
);
