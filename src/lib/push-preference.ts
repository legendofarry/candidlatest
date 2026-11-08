const PUSH_OPT_IN_KEY = "candid.push-opt-in.v1";
const PUSH_TOKEN_KEY = "candid.push-token.v1";

/** Store the user's choice for this browser/app installation. */
export function setPushOptIn(enabled: boolean) {
  try {
    localStorage.setItem(PUSH_OPT_IN_KEY, enabled ? "1" : "0");
  } catch {
    // Notification permission remains the fallback if browser storage is unavailable.
  }
}

/** Migrate older granted permissions once, but preserve an explicit opt-out. */
export function hasPushOptIn(permission: NotificationPermission) {
  try {
    const saved = localStorage.getItem(PUSH_OPT_IN_KEY);
    if (saved === "0") return false;
    if (saved === "1") return true;
    const previouslyGranted = permission === "granted";
    if (previouslyGranted) setPushOptIn(true);
    return previouslyGranted;
  } catch {
    return permission === "granted";
  }
}

export function getPushToken() {
  try {
    return localStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setPushToken(token: string | null) {
  try {
    if (token) localStorage.setItem(PUSH_TOKEN_KEY, token);
    else localStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // Token sync still works for the current session when storage is unavailable.
  }
}
