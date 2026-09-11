import { getFirestoreDb } from "./firebase.server";
import type { CompanyRecord } from "./firebase-data.server";

export type AccountType = "individual" | "company" | "unknown";
export type BadgeStatus = "none" | "eligible" | "claimed";

export type VerificationRecord = {
  user_id: string;
  account_type: AccountType;
  badge_status: BadgeStatus;
  company_id: string | null;
  company_name: string | null;
  company_slug: string | null;
  /** Set by the owner app; when present it wins over automatic detection. */
  owner_override: AccountType | null;
  owner_verified: boolean;
  snoozed_until: string | null;
  claimed_at: string | null;
  checked_at: string;
};

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "mail.com",
  "gmx.com",
  "yandex.com",
]);

function emailDomain(email: string | null | undefined) {
  if (!email || !email.includes("@")) return null;
  return email.split("@").pop()?.trim().toLowerCase() ?? null;
}

function domainRoot(domain: string) {
  const parts = domain.split(".").filter(Boolean);
  // co.ke / or.ke / ac.ke style suffixes keep the label before them.
  if (parts.length >= 3 && (parts.at(-2)?.length ?? 0) <= 3) return parts.at(-3) ?? parts[0]!;
  return parts.at(-2) ?? parts[0]!;
}

function tokenize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Matches a corporate email domain against a company already known to Candid. */
export function matchCompanyByDomain(domain: string, companies: CompanyRecord[]) {
  const root = tokenize(domainRoot(domain));
  if (root.length < 3) return null;
  return (
    companies.find((company) => tokenize(company.slug) === root) ??
    companies.find((company) => tokenize(company.name) === root) ??
    companies.find((company) => tokenize(company.name).startsWith(root) && root.length >= 5) ??
    null
  );
}

const defaults = (userId: string): VerificationRecord => ({
  user_id: userId,
  account_type: "unknown",
  badge_status: "none",
  company_id: null,
  company_name: null,
  company_slug: null,
  owner_override: null,
  owner_verified: false,
  snoozed_until: null,
  claimed_at: null,
  checked_at: new Date().toISOString(),
});

export async function readVerification(userId: string): Promise<VerificationRecord | null> {
  const db = getFirestoreDb();
  const snap = await db.collection("account_verifications").doc(userId).get();
  if (!snap.exists) return null;
  return { ...defaults(userId), ...(snap.data() as Partial<VerificationRecord>) };
}

/**
 * Works out whether this account looks like a company, and whether it may claim
 * the verified badge. Owner decisions (owner_override / owner_verified) win.
 */
export async function resolveVerification(
  userId: string,
  email: string | null,
  emailVerified: boolean,
): Promise<VerificationRecord> {
  const db = getFirestoreDb();
  const existing = (await readVerification(userId)) ?? defaults(userId);

  const domain = emailDomain(email);
  const corporate = Boolean(domain && !FREE_EMAIL_DOMAINS.has(domain));

  let company: CompanyRecord | null = null;
  if (corporate && domain) {
    const snapshot = await db.collection("companies").get();
    const companies = snapshot.docs.map(
      (doc) => ({ ...(doc.data() as CompanyRecord), id: doc.id }) as CompanyRecord,
    );
    company = matchCompanyByDomain(domain, companies);
  }

  const detected: AccountType = company ? "company" : corporate ? "unknown" : "individual";
  const accountType: AccountType = existing.owner_override ?? detected;

  const eligible =
    existing.owner_verified || (accountType === "company" && emailVerified && Boolean(company));

  const badgeStatus: BadgeStatus =
    existing.badge_status === "claimed" ? "claimed" : eligible ? "eligible" : "none";

  const next: VerificationRecord = {
    ...existing,
    account_type: accountType,
    badge_status: badgeStatus,
    company_id: company?.id ?? existing.company_id,
    company_name: company?.name ?? existing.company_name,
    company_slug: company?.slug ?? existing.company_slug,
    checked_at: new Date().toISOString(),
  };

  await db.collection("account_verifications").doc(userId).set(next, { merge: true });
  await db
    .collection("profiles")
    .doc(userId)
    .set(
      { account_type: accountType, verified: badgeStatus === "claimed" },
      { merge: true },
    );

  return next;
}

export async function claimBadge(userId: string) {
  const db = getFirestoreDb();
  const current = await readVerification(userId);
  if (!current || current.badge_status === "none") {
    return { ok: false as const, reason: "This account is not eligible for a badge yet." };
  }
  const now = new Date().toISOString();
  await db
    .collection("account_verifications")
    .doc(userId)
    .set({ badge_status: "claimed", claimed_at: now, snoozed_until: null }, { merge: true });
  await db
    .collection("profiles")
    .doc(userId)
    .set({ verified: true, account_type: current.account_type }, { merge: true });
  return { ok: true as const };
}

export async function snoozeBadgePrompt(userId: string, hours = 24) {
  const until = new Date(Date.now() + hours * 3_600_000).toISOString();
  await getFirestoreDb()
    .collection("account_verifications")
    .doc(userId)
    .set({ snoozed_until: until }, { merge: true });
  return { ok: true as const, snoozed_until: until };
}
