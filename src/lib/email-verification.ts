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

export function firebaseAuthErrorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String((error as { code?: unknown }).code ?? "");
}

/** Give members a useful next step when Firebase rejects a verification email request. */
export function verificationEmailErrorMessage(error: unknown): string {
  const code = firebaseAuthErrorCode(error);
  if (code === "auth/too-many-requests" || code === "auth/quota-exceeded") {
    return "Firebase is temporarily limiting verification emails. Wait a few minutes, then try again.";
  }
  if (code === "auth/unauthorized-continue-uri" || code === "auth/invalid-continue-uri") {
    return "Firebase rejected this verification link. Add this app’s domain under Firebase Authentication → Settings → Authorized domains, then resend.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Email verification is disabled for this Firebase project. Enable Email/Password in Firebase Authentication → Sign-in method.";
  }
  if (code === "auth/network-request-failed") {
    return "We couldn’t reach Firebase. Check your connection, then try sending the email again.";
  }
  if (code === "auth/user-disabled") {
    return "Firebase has disabled this account. Contact Candid support for help.";
  }
  return "Firebase couldn’t start the verification email. Try again; if it keeps failing, check the Firebase Authentication email template and authorized domains.";
}
