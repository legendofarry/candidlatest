// WebAuthn (fingerprint / face unlock) helpers.
// We use a platform authenticator as a *local* fast-unlock for an already
// persisted Firebase session — no passwords are ever stored on the device.

export interface StoredCredential {
  id: string;
  label: string;
  userId: string;
  createdAt: string;
  lastUsedAt?: string;
}

const CREDENTIALS_KEY = "candid_webauthn_credentials";
const SESSION_UNLOCKED_KEY = "candid_biometric_unlocked";

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let raw = "";
  bytes.forEach((b) => {
    raw += String.fromCharCode(b);
  });
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomChallenge() {
  const bytes = new Uint8Array(new ArrayBuffer(32));
  crypto.getRandomValues(bytes);
  return bytes;
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    !!navigator.credentials
  );
}

/** True when the device has a fingerprint sensor / face unlock available. */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function getCredentials(): StoredCredential[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(CREDENTIALS_KEY);
    return stored ? (JSON.parse(stored) as StoredCredential[]) : [];
  } catch {
    return [];
  }
}

function saveCredentials(list: StoredCredential[]) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(list));
}

export function hasCredentialFor(userId: string): boolean {
  return getCredentials().some((c) => c.userId === userId);
}

export async function registerBiometric(
  userId: string,
  userName: string,
): Promise<StoredCredential> {
  if (!isWebAuthnSupported()) throw new Error("This device does not support biometric unlock.");

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: "Candid", id: window.location.hostname },
      user: {
        id: fromBase64Url(btoa(userId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },
        { alg: -257, type: "public-key" },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Biometric setup was cancelled.");

  const record: StoredCredential = {
    id: toBase64Url(credential.rawId),
    label: `${navigator.platform || "This device"} · ${new Date().toLocaleDateString()}`,
    userId,
    createdAt: new Date().toISOString(),
  };

  saveCredentials([...getCredentials().filter((c) => c.id !== record.id), record]);
  markUnlocked();
  return record;
}

export async function authenticateWithBiometric(userId?: string): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  const stored = getCredentials().filter((c) => !userId || c.userId === userId);
  if (stored.length === 0) return false;

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        timeout: 60_000,
        userVerification: "required",
        allowCredentials: stored.map((c) => ({
          id: fromBase64Url(c.id),
          type: "public-key" as const,
        })),
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return false;

    const all = getCredentials();
    const match = all.find((c) => c.id === toBase64Url(assertion.rawId));
    if (match) {
      match.lastUsedAt = new Date().toISOString();
      saveCredentials(all);
    }
    markUnlocked();
    return true;
  } catch (error) {
    console.warn("[biometrics] authentication failed", error);
    return false;
  }
}

export function removeCredential(credentialId: string): void {
  saveCredentials(getCredentials().filter((c) => c.id !== credentialId));
}

export function clearCredentials(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CREDENTIALS_KEY);
  sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
}

export function markUnlocked() {
  try {
    sessionStorage.setItem(SESSION_UNLOCKED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isUnlockedThisSession(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "1";
  } catch {
    return true;
  }
}

export function lockNow() {
  try {
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
  } catch {
    /* ignore */
  }
}
