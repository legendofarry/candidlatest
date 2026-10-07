import type { User } from "firebase/auth";

/** Require verification when the signed-in Firebase account has an unverified email. */
export function requiresEmailVerification(user: User | null | undefined): boolean {
  return Boolean(user?.email && !user.emailVerified);
}

export function verificationActionSettings() {
  return {
    url: `${window.location.origin}/verify-email`,
    handleCodeInApp: false,
  };
}
