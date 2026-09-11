import { getFirestoreDb } from "./firebase.server";
import type { ProfileRecord } from "./firebase-data.server";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

const RESERVED = new Set([
  "candid",
  "admin",
  "administrator",
  "support",
  "help",
  "owner",
  "official",
  "moderator",
  "mod",
  "staff",
  "team",
  "root",
  "system",
  "security",
  "api",
  "null",
  "undefined",
]);

export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

export type UsernameCheck = {
  username: string;
  available: boolean;
  reason: string | null;
};

export function validateUsername(raw: string): { ok: boolean; reason: string | null } {
  const value = normalizeUsername(raw);
  if (value.length < USERNAME_MIN) {
    return { ok: false, reason: `At least ${USERNAME_MIN} characters.` };
  }
  if (value.length > USERNAME_MAX) {
    return { ok: false, reason: `At most ${USERNAME_MAX} characters.` };
  }
  if (!/^[a-z0-9._]+$/.test(value)) {
    return { ok: false, reason: "Letters, numbers, dots and underscores only." };
  }
  if (!/^[a-z0-9]/.test(value)) {
    return { ok: false, reason: "Must start with a letter or number." };
  }
  if (/[._]{2,}/.test(value)) {
    return { ok: false, reason: "No repeated dots or underscores." };
  }
  if (/[._]$/.test(value)) {
    return { ok: false, reason: "Cannot end with a dot or underscore." };
  }
  if (RESERVED.has(value)) {
    return { ok: false, reason: "That username is reserved." };
  }
  return { ok: true, reason: null };
}

/** Returns true when no other account holds this username. */
export async function isUsernameFree(username: string, currentUserId?: string) {
  const db = getFirestoreDb();
  const snap = await db.collection("usernames").doc(normalizeUsername(username)).get();
  if (!snap.exists) return true;
  const ownerId = (snap.data() as { user_id?: string } | undefined)?.user_id;
  return Boolean(currentUserId && ownerId === currentUserId);
}

export async function checkUsernameAvailability(
  raw: string,
  currentUserId?: string,
): Promise<UsernameCheck> {
  const username = normalizeUsername(raw);
  const validity = validateUsername(username);
  if (!validity.ok) return { username, available: false, reason: validity.reason };
  const free = await isUsernameFree(username, currentUserId);
  return {
    username,
    available: free,
    reason: free ? null : "Already taken — try one of the suggestions.",
  };
}

const FLAVOURS = ["real", "hq", "ke", "254", "official_ish", "here", "speaks", "daily"];

function candidatesFor(seed: string): string[] {
  const base = normalizeUsername(seed).replace(/[^a-z0-9._]/g, "").slice(0, 14) || "candid_user";
  const out = new Set<string>();
  for (const flavour of FLAVOURS) out.add(`${base}_${flavour}`.slice(0, USERNAME_MAX));
  for (let i = 0; i < 40; i += 1) {
    out.add(`${base}${Math.floor(Math.random() * 9999)}`.slice(0, USERNAME_MAX));
    out.add(`${base}.${Math.floor(Math.random() * 99)}`.slice(0, USERNAME_MAX));
  }
  return [...out];
}

/** Only returns usernames that were confirmed free at generation time. */
export async function suggestUsernames(seed: string, limit = 5, currentUserId?: string) {
  const pool = candidatesFor(seed).filter((value) => validateUsername(value).ok);
  const found: string[] = [];
  for (const candidate of pool) {
    if (found.length >= limit) break;
    // eslint-disable-next-line no-await-in-loop
    if (await isUsernameFree(candidate, currentUserId)) found.push(candidate);
  }
  return found;
}

export type SocialLinks = {
  x: string | null;
  instagram: string | null;
  linkedin: string | null;
  tiktok: string | null;
  website: string | null;
};

export type OnboardingProfile = ProfileRecord & {
  username: string | null;
  socials: SocialLinks | null;
  account_type: "individual" | "company" | "unknown";
  onboarded_at: string | null;
};

export async function readProfile(userId: string): Promise<OnboardingProfile | null> {
  const db = getFirestoreDb();
  const snap = await db.collection("profiles").doc(userId).get();
  if (!snap.exists) return null;
  return snap.data() as OnboardingProfile;
}

export async function claimUsername(
  userId: string,
  rawUsername: string,
  socials: SocialLinks,
): Promise<{ ok: boolean; reason?: string; profile?: OnboardingProfile }> {
  const username = normalizeUsername(rawUsername);
  const validity = validateUsername(username);
  if (!validity.ok) return { ok: false, reason: validity.reason ?? "Invalid username" };

  const db = getFirestoreDb();
  const usernameRef = db.collection("usernames").doc(username);
  const profileRef = db.collection("profiles").doc(userId);
  const now = new Date().toISOString();

  try {
    await db.runTransaction(async (tx) => {
      const [usernameSnap, profileSnap] = await Promise.all([
        tx.get(usernameRef),
        tx.get(profileRef),
      ]);
      const ownerId = (usernameSnap.data() as { user_id?: string } | undefined)?.user_id;
      if (usernameSnap.exists && ownerId !== userId) {
        throw new Error("TAKEN");
      }

      const previous = profileSnap.exists ? (profileSnap.data() as OnboardingProfile) : null;
      if (previous?.username && previous.username !== username) {
        tx.delete(db.collection("usernames").doc(previous.username));
      }

      tx.set(usernameRef, { username, user_id: userId, created_at: now });
      tx.set(
        profileRef,
        {
          id: userId,
          username,
          handle: username,
          socials,
          county: previous?.county ?? null,
          role_label: previous?.role_label ?? null,
          banned: previous?.banned ?? false,
          account_type: previous?.account_type ?? "unknown",
          created_at: previous?.created_at ?? now,
          onboarded_at: previous?.onboarded_at ?? now,
        },
        { merge: true },
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TAKEN") {
      return { ok: false, reason: "Already taken — pick another." };
    }
    throw error;
  }

  const profile = await readProfile(userId);
  return { ok: true, ...(profile ? { profile } : {}) };
}
