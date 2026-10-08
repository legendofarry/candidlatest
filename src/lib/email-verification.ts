import type { User } from "firebase/auth";

/** Require a verified email before a signed-in Firebase account can use Candid. */
export function requiresEmailVerification(user: User | null | undefined): boolean {
  return Boolean(user && (!user.email || !user.emailVerified));
}

export function verificationActionSettings() {
  return {
    url: `${window.location.origin}/verify-email`,
    handleCodeInApp: false,
  };
}
