import { getFirestoreDb } from "./firebase.server";
import { isPresetAvatarUrl } from "./preset-avatars";
import type { ProfileRecord } from "./firebase-data.server";
import { DEFAULT_MEMBERSHIP } from "./membership";
import { generateAliasCandidate, type AliasAgeRange } from "./alias-generator";

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

/** Only returns usernames that were confirmed free at generation time. */
export async function suggestUsernames(
  seed: string,
  limit = 5,
  currentUserId?: string,
  ageRange: AliasAgeRange = "skip",
) {
  const found = new Set<string>();
  for (let attempt = 0; attempt < 80 && found.size < Math.min(limit, 10); attempt += 1) {
    const candidate = generateAliasCandidate(seed, [], ageRange, attempt);
    if (!validateUsername(candidate).ok || !(await isUsernameFree(candidate, currentUserId)))
      continue;
    found.add(candidate);
  }
  return [...found];
}

export type SocialLinks = {
  x: string | null;
  instagram: string | null;
  linkedin: string | null;
  tiktok: string | null;
  website: string | null;
};

/** Stores only canonical HTTPS links so profile links are safe to open in the app. */
export function normalizeSocialLinks(input: SocialLinks): SocialLinks {
  const handleUrl = (value: string | null, host: string, prefix = "") => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return null;
    if (/^https:\/\//i.test(trimmed)) return safeHttpsUrl(trimmed);
    const handle = trimmed.replace(/^@/, "").replace(/^\/+/, "");
    return handle ? `https://${host}/${prefix}${encodeURIComponent(handle)}` : null;
  };
  return {
    x: handleUrl(input.x, "x.com"),
    instagram: handleUrl(input.instagram, "instagram.com"),
    tiktok: handleUrl(input.tiktok, "tiktok.com", "@"),
    linkedin: handleUrl(input.linkedin, "linkedin.com"),
    website: safeHttpsUrl(input.website),
  };
}

export function safeHttpsUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type OnboardingProfile = ProfileRecord & {
  username: string | null;
  socials: SocialLinks | null;
  account_type: "individual" | "company" | "official" | "unknown";
  onboarded_at: string | null;
};

export async function readProfile(userId: string): Promise<OnboardingProfile | null> {
  const db = getFirestoreDb();
  const snap = await db.collection("profiles").doc(userId).get();
  if (!snap.exists) return null;
  return snap.data() as OnboardingProfile;
}

/** Saves only the Cloudinary delivery URL; image bytes never enter Firestore. */
export async function saveProfilePhoto(userId: string, photoUrl: string, kind: "avatar" | "cover" = "avatar") {
  const field = kind === "cover" ? "cover_url" : "photo_url";
  if (isPresetAvatarUrl(photoUrl)) {
    const db = getFirestoreDb();
    await db
      .collection("profiles")
      .doc(userId)
      .set(
        { id: userId, [field]: photoUrl, updated_at: new Date().toISOString() },
        { merge: true },
      );
    return { photoUrl };
  }
  const url = new URL(photoUrl);
  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") {
    throw new Error("Choose a valid Cloudinary image.");
  }
  const db = getFirestoreDb();
  await db
    .collection("profiles")
    .doc(userId)
    .set(
      { id: userId, [field]: url.toString(), updated_at: new Date().toISOString() },
      { merge: true },
    );
  return { photoUrl: url.toString() };
}

export async function changeUsername(userId: string, rawUsername: string) {
  const username = normalizeUsername(rawUsername);
  const validity = validateUsername(username);
  if (!validity.ok) return { ok: false as const, reason: validity.reason ?? "Invalid username" };
  const db = getFirestoreDb();
  const profileRef = db.collection("profiles").doc(userId);
  const usernameRef = db.collection("usernames").doc(username);
  const now = new Date();
  const nowIso = now.toISOString();
  try {
    await db.runTransaction(async (tx) => {
      const profileSnap = await tx.get(profileRef);
      const usernameSnap = await tx.get(usernameRef);
      const profile = profileSnap.data() as OnboardingProfile | undefined;
      const oldUsername = profile?.username ?? null;
      if (!oldUsername) throw new Error("Claim a username before changing it.");
      if (oldUsername === username) throw new Error("Choose a different username.");
      const changedAt = profile?.username_changed_at;
      if (changedAt) {
        const nextChangeAt = Date.parse(changedAt) + 14 * 24 * 60 * 60 * 1000;
        if (Number.isFinite(nextChangeAt) && now.getTime() < nextChangeAt) {
          throw new Error(
            `You can change your username again on ${new Date(nextChangeAt).toLocaleDateString("en-KE")}.`,
          );
        }
      }
      const ownerId = (usernameSnap.data() as { user_id?: string } | undefined)?.user_id;
      if (usernameSnap.exists && ownerId !== userId) throw new Error("TAKEN");
      tx.delete(db.collection("usernames").doc(oldUsername));
      tx.set(usernameRef, { username, user_id: userId, created_at: nowIso });
      tx.set(
        profileRef,
        { username, handle: username, username_changed_at: nowIso },
        { merge: true },
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TAKEN") {
      return { ok: false as const, reason: "Already taken — pick another." };
    }
    if (
      error instanceof Error &&
      /Claim a username|Choose a different|change your username/.test(error.message)
    ) {
      return { ok: false as const, reason: error.message };
    }
    throw error;
  }
  return { ok: true as const, username, changedAt: nowIso };
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
  const safeSocials = normalizeSocialLinks(socials);

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
          socials: safeSocials,
          county: previous?.county ?? null,
          role_label: previous?.role_label ?? null,
          banned: previous?.banned ?? false,
          account_type: previous?.account_type ?? "unknown",
          subscription_tier: previous?.subscription_tier ?? DEFAULT_MEMBERSHIP.subscription_tier,
          subscription_status:
            previous?.subscription_status ?? DEFAULT_MEMBERSHIP.subscription_status,
          subscription_provider:
            previous?.subscription_provider ?? DEFAULT_MEMBERSHIP.subscription_provider,
          subscription_started_at:
            previous?.subscription_started_at ?? DEFAULT_MEMBERSHIP.subscription_started_at,
          subscription_period_ends_at:
            previous?.subscription_period_ends_at ?? DEFAULT_MEMBERSHIP.subscription_period_ends_at,
          subscription_source:
            previous?.subscription_source ??
            (previous?.subscription_tier && previous.subscription_tier !== "basic"
              ? "manual"
              : DEFAULT_MEMBERSHIP.subscription_source),
          subscription_version:
            previous?.subscription_version ?? DEFAULT_MEMBERSHIP.subscription_version,
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
  try {
    const { ensureWelcomeMessage } = await import("./messaging.server");
    await ensureWelcomeMessage(userId);
  } catch (error) {
    console.error("[welcome message] delivery deferred after onboarding", error);
  }
  return { ok: true, ...(profile ? { profile } : {}) };
}

/** Link the reserved official Candid handle to its verified owner login. */
export async function claimOfficialCandidAccount(userId: string, email: string) {
  if (email.trim().toLowerCase() !== "karimiarrison@gmail.com") {
    throw new Error("This login is not authorized to claim the Candid account.");
  }

  const db = getFirestoreDb();
  const now = new Date().toISOString();
  const profileRef = db.collection("profiles").doc(userId);
  const verificationRef = db.collection("account_verifications").doc(userId);
  const candidUsernameRef = db.collection("usernames").doc("candid");
  const officialAccountRef = db.collection("app_config").doc("official-candid-account");
  const legacyProfileRef = db.collection("profiles").doc("candid-official");
  const legacyVerificationRef = db.collection("account_verifications").doc("candid-official");

  await db.runTransaction(async (tx) => {
    const [profileSnap, usernameSnap, legacyProfileSnap] = await Promise.all([
      tx.get(profileRef),
      tx.get(candidUsernameRef),
      tx.get(legacyProfileRef),
    ]);
    const profile = profileSnap.data() as
      (ProfileRecord & { username?: string | null }) | undefined;
    const usernameOwner = (usernameSnap.data() as { user_id?: string } | undefined)?.user_id;
    if (usernameSnap.exists && usernameOwner !== userId && usernameOwner !== "candid-official") {
      throw new Error("The @candid username is already assigned to another account.");
    }

    const previousUsername = profile?.username?.trim().toLowerCase();
    if (previousUsername && previousUsername !== "candid") {
      const previousUsernameRef = db.collection("usernames").doc(previousUsername);
      const previousUsernameSnap = await tx.get(previousUsernameRef);
      const previousOwner = (previousUsernameSnap.data() as { user_id?: string } | undefined)
        ?.user_id;
      if (previousUsernameSnap.exists && previousOwner === userId) tx.delete(previousUsernameRef);
    }

    tx.set(candidUsernameRef, { username: "candid", user_id: userId, created_at: now });
    tx.set(
      profileRef,
      {
        id: userId,
        username: "candid",
        handle: "candid",
        role_label: "Candid team",
        account_type: "official",
        verified: true,
        subscription_tier: "gold",
        subscription_status: "active",
        subscription_source: "complimentary",
        subscription_provider: null,
        subscription_started_at: null,
        subscription_period_ends_at: null,
        subscription_switch_unlocked: false,
        official_account_claimed_at: now,
      },
      { merge: true },
    );
    tx.set(
      verificationRef,
      {
        id: userId,
        user_id: userId,
        account_type: "official",
        company_id: null,
        company_name: null,
        company_slug: null,
        owner_override: "official",
        badge_status: "claimed",
        owner_verified: true,
        approval_status: "approved",
        claimed_at: now,
        checked_at: now,
      },
      { merge: true },
    );
    tx.set(
      officialAccountRef,
      { user_id: userId, email: "karimiarrison@gmail.com", linked_at: now },
      { merge: true },
    );

    // Retain the old system profile for its historical references, but release
    // the public handle so the authenticated account can own @candid.
    if (legacyProfileSnap.exists && userId !== "candid-official") {
      tx.set(
        legacyProfileRef,
        {
          username: "candid_archive",
          handle: "candid_archive",
          account_type: "unknown",
          verified: false,
          migrated_to: userId,
        },
        { merge: true },
      );
      tx.set(
        legacyVerificationRef,
        {
          account_type: "unknown",
          owner_override: null,
          badge_status: "none",
          owner_verified: false,
          approval_status: "none",
        },
        { merge: true },
      );
    }
  });

  return { ok: true as const, username: "candid" as const };
}

/** Records a self-declared account type for accounts we could not classify. */
export async function setAccountType(userId: string, accountType: "individual" | "company") {
  const db = getFirestoreDb();
  const now = new Date().toISOString();
  await db
    .collection("profiles")
    .doc(userId)
    .set({ id: userId, account_type: accountType, account_type_declared_at: now }, { merge: true });
  return { ok: true as const, accountType };
}
