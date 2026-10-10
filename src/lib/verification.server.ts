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
  approval_status?: "none" | "pending_review" | "approved" | "declined";
  requested_at?: string | null;
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
  approval_status: "none",
  requested_at: null,
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

  let matchedCompany: CompanyRecord | null = null;
  if (corporate && domain) {
    const snapshot = await db.collection("companies").get();
    const companies = snapshot.docs.map(
      (doc) => ({ ...(doc.data() as CompanyRecord), id: doc.id }) as CompanyRecord,
    );
    matchedCompany = matchCompanyByDomain(domain, companies);
  }

  const claimedElsewhere = Boolean(matchedCompany?.claimed_by && matchedCompany.claimed_by !== userId);
  const company = claimedElsewhere ? null : matchedCompany;

  const detected: AccountType = company ? "company" : corporate ? "unknown" : "individual";
  const accountType: AccountType = existing.owner_override ?? detected;

  const eligible = existing.owner_verified || (
    accountType === "company" && emailVerified && Boolean(company?.verified)
  );

  const badgeStatus: BadgeStatus =
    existing.badge_status === "claimed" ? "claimed" : eligible ? "eligible" : "none";

  const next: VerificationRecord = {
    ...existing,
    account_type: accountType,
    badge_status: badgeStatus,
    company_id: claimedElsewhere ? null : company?.id ?? existing.company_id,
    company_name: claimedElsewhere ? null : company?.name ?? existing.company_name,
    company_slug: claimedElsewhere ? null : company?.slug ?? existing.company_slug,
    checked_at: new Date().toISOString(),
  };

  await db.collection("account_verifications").doc(userId).set(next, { merge: true });
  await db
    .collection("profiles")
    .doc(userId)
    .set({ account_type: accountType, verified: badgeStatus === "claimed" }, { merge: true });

  return next;
}

export async function claimBadge(userId: string, email: string | null, emailVerified: boolean) {
  const db = getFirestoreDb();
  const current = await readVerification(userId);
  if (!current || current.badge_status === "none") {
    return { ok: false as const, reason: "This account is not eligible for a badge yet." };
  }
  if (current.badge_status === "claimed") return { ok: true as const, approved: true as const };

  const reviewRef = db.collection("account_verification_reviews").doc(userId);
  const reviewSnapshot = await reviewRef.get();
  const reviewData = reviewSnapshot.data() as { status?: string } | undefined;
  if (reviewData?.status === "pending_review") {
    return { ok: true as const, pending: true as const };
  }

  const profileSnapshot = await db.collection("profiles").doc(userId).get();
  const profile = profileSnapshot.data() as { username?: string | null } | undefined;
  const companySnapshot = current.company_id
    ? await db.collection("companies").doc(current.company_id).get()
    : null;
  const company = companySnapshot?.data() as { verified?: boolean; claimed_by?: string | null } | undefined;
  if (current.account_type === "company" && current.company_id && company?.claimed_by && company.claimed_by !== userId) {
    return { ok: false as const, reason: "This company account is already linked to another official account." };
  }
  const { reviewAccountVerification } = await import("./ai.server");
  const screen = await reviewAccountVerification({
    email,
    emailVerified,
    username: profile?.username ?? null,
    accountType: current.account_type,
    companyName: current.company_name,
    companyVerified: company?.verified === true,
  });
  const timestamp = new Date().toISOString();
  const autoApproved = screen.decision === "auto_approved";
  const reviewRecord = {
    id: userId,
    user_id: userId,
    status: autoApproved ? "approved" : "pending_review",
    decision: screen.decision,
    recommendation: screen.recommendation,
    confidence: screen.confidence,
    risk_level: screen.risk_level,
    flags: screen.flags,
    summary: screen.summary,
    model: screen.model,
    requested_at: timestamp,
    reviewed_at: autoApproved ? timestamp : null,
    reviewed_by: autoApproved ? "ai" : null,
  };
  const verificationRef = db.collection("account_verifications").doc(userId);
  const profileRef = db.collection("profiles").doc(userId);
  const auditRef = db.collection("owner_audit_log").doc();
  const batch = db.batch();
  if (autoApproved && current.account_type === "company" && current.company_id && companySnapshot?.exists && !company?.claimed_by) {
    batch.update(db.collection("companies").doc(current.company_id), { claimed_by: userId }, companySnapshot.updateTime ? { updateTime: companySnapshot.updateTime } : undefined);
  }
  batch.set(reviewRef, reviewRecord);
  batch.set(verificationRef, {
    badge_status: autoApproved ? "claimed" : "eligible",
    approval_status: autoApproved ? "approved" : "pending_review",
    claimed_at: autoApproved ? timestamp : null,
    requested_at: timestamp,
    snoozed_until: null,
  }, { merge: true });
  batch.set(profileRef, {
    verified: autoApproved,
    account_type: current.account_type,
  }, { merge: true });
  batch.create(auditRef, {
    id: auditRef.id,
    action: autoApproved ? "account_verification.ai_approved" : "account_verification.ai_queued",
    target_type: "user",
    target_id: userId,
    payload: {
      recommendation: screen.recommendation,
      decision: screen.decision,
      confidence: screen.confidence,
      risk_level: screen.risk_level,
      model: screen.model,
    },
    created_at: timestamp,
  });
  try {
    await batch.commit();
  } catch (error) {
    if (autoApproved && current.account_type === "company") {
      return { ok: false as const, reason: "Another account claimed this company first. Contact Candid if this is your official account." };
    }
    throw error;
  }
  return autoApproved
    ? { ok: true as const, approved: true as const }
    : { ok: true as const, pending: true as const };
}

export async function snoozeBadgePrompt(userId: string, hours = 24) {
  const until = new Date(Date.now() + hours * 3_600_000).toISOString();
  await getFirestoreDb()
    .collection("account_verifications")
    .doc(userId)
    .set({ snoozed_until: until }, { merge: true });
  return { ok: true as const, snoozed_until: until };
}
