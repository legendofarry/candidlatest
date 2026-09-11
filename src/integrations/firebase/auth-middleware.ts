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

    return next({
      context: {
        db: getFirestoreDb(),
        userId: decoded.uid,
        claims: decoded,
      },
    });
  },
);
