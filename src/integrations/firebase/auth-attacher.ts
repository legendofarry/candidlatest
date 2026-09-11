import { createMiddleware } from "@tanstack/react-start";
import { firebaseAuth } from "./client";

// Registers the current Firebase ID token on server-function RPCs.
export const attachFirebaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const user = firebaseAuth.currentUser;
    const token = user ? await user.getIdToken() : null;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
