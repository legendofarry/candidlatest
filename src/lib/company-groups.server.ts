import { getFirestoreDb } from "./firebase.server";
import type { CompanyRecord, ProfileRecord, StoryRecord } from "./firebase-data.server";
import { getEffectiveMembershipTier } from "./membership";

export const COMPANY_GROUP_DEFAULT_RULES = [
  "Share your own experience and make clear what you witnessed firsthand.",
  "Keep private names, contact details, identification numbers, and confidential documents out of posts.",
  "Disagreement is welcome. Threats, harassment, hate speech, and sexual content are not.",
  "Moderators can hide discussion that breaks these rules. You can ask Candid to review a decision.",
] as const;

const MAX_GROUP_RULES = 10;
const MAX_GROUP_POST_LENGTH = 3000;
const MAX_WORK_HISTORY_COMPANIES = 20;

export type CompanyGroupRole = "member" | "moderator" | "lead_moderator";
type CompanyGroupMember = {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyGroupRole;
  status: "active" | "left" | "removed";
  joined_at: string;
  source?: string;
  removed_at?: string;
  removed_by?: string;
};

type CompanyGroupPost = {
  id: string;
  company_id: string;
  author_id: string;
  author_username: string | null;
  author_photo_url: string | null;
  author_kind?: "member" | "official_company";
  is_anonymous?: boolean;
  body: string;
  status: "published" | "hidden";
  moderation_reason?: string | null;
  created_at: string;
};

type WorkHistoryRecord = {
  id: string;
  user_id: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  company_industry: string | null;
  visibility: "private";
  source: "self_reported";
  created_at: string;
  updated_at: string;
};

function memberId(companyId: string, userId: string) {
  return `${companyId}__${userId}`;
}

function safeUsername(profile: ProfileRecord | undefined) {
  if (!profile || profile.banned || profile.profile_visibility === "private") return null;
  if (["deactivated", "deletion_pending", "deletion_in_progress"].includes(profile.account_status ?? "")) {
    return null;
  }
  return profile.username ?? profile.handle ?? null;
}

async function readCompany(companyId: string): Promise<CompanyRecord | null> {
  const db = getFirestoreDb();
  const snap = await db.collection("companies").doc(companyId).get();
  if (!snap.exists) return null;
  const company = { ...(snap.data() as CompanyRecord), id: snap.id };
  if (company.is_public === false) {
    const publicFeedStories = await db
      .collection("stories")
      .where("company_id", "==", company.id)
      .where("status", "==", "published")
      .get();
    const hasPublicCompanyStory = publicFeedStories.docs.some(
      (story) => story.get("feed_visibility") !== "company_only" && story.get("company_public") !== false,
    );
    if (!hasPublicCompanyStory) return null;
  }
  return company;
}

async function isOfficialAccount(userId: string) {
  const snap = await getFirestoreDb().collection("profiles").doc(userId).get();
  const profile = snap.data() as ProfileRecord | undefined;
  return profile?.account_type === "official";
}

async function isGroupModerator(companyId: string, userId: string) {
  const member = await getFirestoreDb()
    .collection("company_group_members")
    .doc(memberId(companyId, userId))
    .get();
  const record = member.data() as CompanyGroupMember | undefined;
  return Boolean(
    record?.status === "active" &&
    (record.role === "moderator" || record.role === "lead_moderator"),
  );
}

async function assertModerator(companyId: string, userId: string) {
  if (!(await isGroupModerator(companyId, userId)) && !(await isOfficialAccount(userId))) {
    throw new Error("Only this company group’s moderators can do that.");
  }
}

function ensureGroupData(company: CompanyRecord, data?: Record<string, unknown>) {
  return {
    id: company.id,
    company_id: company.id,
    company_name: company.name,
    company_slug: company.slug,
    industry: company.industry ?? null,
    rules: Array.isArray(data?.["rules"])
      ? (data["rules"] as unknown[]).filter((rule): rule is string => typeof rule === "string").slice(0, MAX_GROUP_RULES)
      : [...COMPANY_GROUP_DEFAULT_RULES],
    lead_moderator_id:
      typeof data?.["lead_moderator_id"] === "string" ? data["lead_moderator_id"] : null,
    created_at: typeof data?.["created_at"] === "string" ? data["created_at"] : null,
    updated_at: typeof data?.["updated_at"] === "string" ? data["updated_at"] : null,
  };
}

function toPublicPost(post: CompanyGroupPost, profile?: ProfileRecord) {
  const hiddenByPrivacy = !safeUsername(profile);
  return {
    id: post.id,
    company_id: post.company_id,
    author_id: post.author_id,
    author_username: post.is_anonymous
      ? "Anonymous member"
      : hiddenByPrivacy
        ? "Private member"
        : post.author_username,
    author_photo_url: post.is_anonymous || hiddenByPrivacy ? null : post.author_photo_url,
    author_kind: post.author_kind ?? "member",
    is_anonymous: Boolean(post.is_anonymous),
    body: post.body,
    created_at: post.created_at,
  };
}

export async function getCompanyGroupView(companyId: string, viewerId: string | null) {
  const db = getFirestoreDb();
  const company = await readCompany(companyId);
  if (!company) return null;
  await ensureGroupExists(company);
  const [groupSnap, memberSnap, membersSnap, postsSnap, requestSnap, applicationSnap, viewerProfileSnap, viewerVerificationSnap] = await Promise.all([
    db.collection("company_groups").doc(companyId).get(),
    viewerId ? db.collection("company_group_members").doc(memberId(companyId, viewerId)).get() : null,
    db.collection("company_group_members").where("company_id", "==", companyId).get(),
    db.collection("company_group_posts").where("company_id", "==", companyId).limit(100).get(),
    viewerId ? db.collection("company_group_join_requests").doc(memberId(companyId, viewerId)).get() : null,
    viewerId ? db.collection("company_moderator_applications").doc(memberId(companyId, viewerId)).get() : null,
    viewerId ? db.collection("profiles").doc(viewerId).get() : null,
    viewerId ? db.collection("account_verifications").doc(viewerId).get() : null,
  ]);
  const viewerIdentitySnap = viewerId
    ? await db.collection("moderator_identity_verifications").doc(viewerId).get()
    : null;
  const activeMembers = membersSnap.docs
    .map((doc) => ({ ...(doc.data() as CompanyGroupMember), id: doc.id }))
    .filter((member) => member.status === "active");
  const currentMember = (memberSnap?.data() as CompanyGroupMember | undefined) ?? null;
  const viewerIsMember = currentMember?.status === "active";
  const viewerIsGroupModerator = Boolean(
    viewerIsMember &&
    (currentMember?.role === "moderator" || currentMember?.role === "lead_moderator"),
  );
  const viewerProfile = viewerProfileSnap?.data() as ProfileRecord | undefined;
  const viewerIsOfficial = viewerProfile?.account_type === "official";
  const viewerIsModerator = viewerIsGroupModerator || viewerIsOfficial;
  const group = ensureGroupData(company, groupSnap.data() as Record<string, unknown> | undefined);
  const posts = postsSnap.docs
    .map((doc) => ({ ...(doc.data() as CompanyGroupPost), id: doc.id }))
    .filter((post) => post.status === "published")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);
  const postProfiles = await Promise.all(
    [...new Set(posts.map((post) => post.author_id))].map(async (userId) => {
      const snap = await db.collection("profiles").doc(userId).get();
      return [userId, snap.data() as ProfileRecord | undefined] as const;
    }),
  );
  const profilesById = new Map(postProfiles);
  const publicMembers = viewerIsMember || viewerIsOfficial
    ? await Promise.all(
        activeMembers.map(async (member) => {
          const profileSnap = await db.collection("profiles").doc(member.user_id).get();
          const profile = profileSnap.data() as ProfileRecord | undefined;
          const username = safeUsername(profile);
          return username
            ? {
                user_id: member.user_id,
                username,
                photo_url: profile?.photo_url ?? null,
                role: member.role,
                joined_at: member.joined_at,
              }
            : null;
        }),
      )
    : [];
  const candidateDocs = viewerIsMember || viewerIsOfficial
    ? (await db.collection("company_moderator_applications").where("company_id", "==", companyId).get()).docs.filter((doc) => doc.get("status") === "pending")
    : [];
  const verifiedCandidateDocs = await Promise.all(candidateDocs.map(async (doc) => {
    const userId = String(doc.get("user_id") ?? "");
    const verification = await db.collection("moderator_identity_verifications").doc(userId).get();
    return verification.get("status") === "approved" ? doc : null;
  }));
  const moderatorCandidates = await Promise.all(verifiedCandidateDocs.filter((doc): doc is NonNullable<typeof doc> => doc !== null).map(async (doc) => {
    const userId = String(doc.get("user_id") ?? "");
    const [profileSnap, endorsementSnap, ownEndorsement, stories, posts, activityDays, groupActivity] = await Promise.all([
      db.collection("profiles").doc(userId).get(),
      db.collection("company_moderator_endorsements").where("company_id", "==", companyId).where("candidate_id", "==", userId).get(),
      viewerId ? db.collection("company_moderator_endorsements").doc(`${companyId}__${userId}__${viewerId}`).get() : null,
      db.collection("stories").where("company_id", "==", companyId).where("author_id", "==", userId).get(),
      db.collection("company_group_posts").where("company_id", "==", companyId).where("author_id", "==", userId).get(),
      db.collection("account_activity_days").where("user_id", "==", userId).get(),
      db.collection("company_group_activity").where("company_id", "==", companyId).where("user_id", "==", userId).get(),
    ]);
    const profile = profileSnap.data() as ProfileRecord | undefined;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const activeDays = activityDays.docs.filter((day) => String(day.get("day") ?? "") >= since).length;
    const groupSeconds = groupActivity.docs
      .filter((day) => String(day.get("day") ?? "") >= since)
      .reduce((sum, day) => sum + Math.max(0, Number(day.get("seconds") ?? 0)), 0);
    const contributions = stories.docs.filter((story) => story.get("status") === "published").length +
      posts.docs.filter((post) => post.get("status") === "published").length;
    const recommendationScore = endorsementSnap.size * 4 + contributions * 2 + activeDays + Math.floor(groupSeconds / 900);
    return {
      user_id: userId,
      username: safeUsername(profile) ?? "Private member",
      photo_url: safeUsername(profile) ? profile?.photo_url ?? null : null,
      note: String(doc.get("note") ?? ""),
      endorsements: endorsementSnap.size,
      active_days: activeDays,
      group_minutes: Math.floor(groupSeconds / 60),
      contributions,
      recommendation_score: recommendationScore,
      recommended: false,
      endorsed_by_viewer: Boolean(ownEndorsement?.exists),
      created_at: String(doc.get("created_at") ?? ""),
    };
  }));
  const joinRequest = requestSnap?.data() as { status?: string } | undefined;
  const moderatorApplication = applicationSnap?.data() as { status?: string } | undefined;
  const viewerVerification = viewerVerificationSnap?.data() as { company_id?: string | null; owner_verified?: boolean } | undefined;
  const viewerIdentity = viewerIdentitySnap?.data() as { status?: string } | undefined;
  const officialCompanyPublisher = Boolean(
    viewerProfile?.account_type === "company" &&
    getEffectiveMembershipTier(viewerProfile) === "premium" &&
    viewerVerification?.owner_verified === true &&
    viewerVerification.company_id === companyId,
  );

  return {
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      industry: company.industry ?? null,
      verified: Boolean(company.verified),
    },
    group,
    member_count: activeMembers.length,
    members: publicMembers.flatMap((member) => member ? [member] : []),
    moderator_candidates: moderatorCandidates
      .sort((a, b) => b.recommendation_score - a.recommendation_score || b.endorsements - a.endorsements || a.created_at.localeCompare(b.created_at))
      .map((candidate, index) => ({ ...candidate, recommended: index === 0 })),
    posts: viewerIsMember || viewerIsOfficial
      ? posts.map((post) => toPublicPost(post, profilesById.get(post.author_id)))
      : [],
    viewer: {
      signed_in: Boolean(viewerId),
      is_member: viewerIsMember,
      role: currentMember?.status === "active" ? currentMember.role : null,
      is_moderator: viewerIsModerator,
      is_official: viewerIsOfficial,
      account_type: viewerProfile?.account_type ?? "unknown",
      can_post: viewerIsMember || officialCompanyPublisher,
      post_mode: officialCompanyPublisher ? "official_company" : "member",
      join_request_status: joinRequest?.status ?? null,
      moderator_application_status: moderatorApplication?.status ?? null,
      moderator_verification_status: viewerIdentity?.status ?? "not_submitted",
    },
  };
}

export async function readMyCompanyWorkHistory(userId: string) {
  const db = getFirestoreDb();
  const history = await db.collection("company_work_history").where("user_id", "==", userId).get();
  return Promise.all(
    history.docs.map(async (doc) => {
      const record = doc.data() as WorkHistoryRecord;
      const company = await readCompany(record.company_id);
      if (!company) return null;
      const [member, joinRequest] = await Promise.all([
        db.collection("company_group_members").doc(memberId(company.id, userId)).get(),
        db.collection("company_group_join_requests").doc(memberId(company.id, userId)).get(),
      ]);
      const membership = member.data() as CompanyGroupMember | undefined;
      return {
        company_id: company.id,
        name: company.name,
        slug: company.slug,
        industry: company.industry ?? null,
        group_member: membership?.status === "active",
        group_role: membership?.status === "active" ? membership.role : null,
        group_request_status: String(joinRequest.get("status") ?? "") || null,
      };
    }),
  ).then((rows) => rows.filter((row): row is NonNullable<typeof row> => Boolean(row)));
}

export async function saveMyCompanyWorkHistory(
  userId: string,
  companyIds: string[],
  joinGroupIds: string[] = [],
) {
  if (companyIds.length > MAX_WORK_HISTORY_COMPANIES) {
    throw new Error(`Choose up to ${MAX_WORK_HISTORY_COMPANIES} companies.`);
  }
  if (new Set(companyIds).size !== companyIds.length) throw new Error("Remove duplicate companies.");
  if (joinGroupIds.some((id) => !companyIds.includes(id))) {
    throw new Error("You can only join groups for companies you selected.");
  }
  const db = getFirestoreDb();
  const profileSnap = await db.collection("profiles").doc(userId).get();
  const profile = profileSnap.data() as ProfileRecord | undefined;
  if (profile?.account_type === "company" && companyIds.length > 0) {
    throw new Error("Company accounts cannot add employee work history.");
  }
  const current = await db.collection("company_work_history").where("user_id", "==", userId).get();
  const companies = await Promise.all(companyIds.map((id) => readCompany(id)));
  if (companies.some((company) => !company)) throw new Error("One of those companies is unavailable.");
  const now = new Date().toISOString();
  const batch = db.batch();
  const selected = new Set(companyIds);
  const existingHistoryIds = new Set(current.docs.map((doc) => String(doc.get("company_id") ?? "")));
  const effectiveJoinGroupIds = [...new Set([
    ...joinGroupIds,
    ...companyIds.filter((companyId) => !existingHistoryIds.has(companyId)),
  ])];
  for (const doc of current.docs) {
    if (!selected.has(String(doc.get("company_id") ?? ""))) batch.delete(doc.ref);
  }
  for (const company of companies) {
    if (!company) continue;
    const id = `${userId}__${company.id}`;
    const ref = db.collection("company_work_history").doc(id);
    batch.set(
      ref,
      {
        id,
        user_id: userId,
        company_id: company.id,
        company_name: company.name,
        company_slug: company.slug,
        company_industry: company.industry ?? null,
        visibility: "private",
        source: "self_reported",
        created_at: current.docs.find((doc) => doc.get("company_id") === company.id)?.get("created_at") ?? now,
        updated_at: now,
      } satisfies WorkHistoryRecord,
    );
  }
  for (const companyId of effectiveJoinGroupIds) {
    const company = companies.find((entry) => entry?.id === companyId);
    if (!company) continue;
    await ensureGroupExists(company);
    const ref = db.collection("company_group_members").doc(memberId(companyId, userId));
    const existing = await ref.get();
    const existingData = existing.data() as CompanyGroupMember | undefined;
    if (existingData?.status === "removed") continue;
    batch.set(ref, {
      id: memberId(companyId, userId),
      company_id: companyId,
      user_id: userId,
      role: existingData?.role ?? "member",
      status: "active",
      source: existingData?.source ?? "work_history_link",
      joined_at: existingData?.joined_at ?? now,
    });
  }
  await batch.commit();
  return { ok: true as const, companyIds, joinedGroupIds: effectiveJoinGroupIds };
}

export async function recordCompanyCommunityActivity(userId: string) {
  const db = getFirestoreDb();
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  await Promise.all([
    db.collection("account_activity_days").doc(`${userId}__${day}`).set({
      user_id: userId,
      day,
      updated_at: now.toISOString(),
    }, { merge: true }),
    db.collection("profiles").doc(userId).set({ last_active_at: now.toISOString() }, { merge: true }),
  ]);
  return { ok: true as const };
}

export async function recordCompanyGroupTime(userId: string, companyId: string, secondsInput: number) {
  const db = getFirestoreDb();
  const memberRef = db.collection("company_group_members").doc(memberId(companyId, userId));
  const member = (await memberRef.get()).data() as CompanyGroupMember | undefined;
  if (member?.status !== "active") throw new Error("Join the company group before recording activity.");
  const seconds = Math.max(15, Math.min(120, Math.floor(secondsInput)));
  const now = new Date();
  const nowIso = now.toISOString();
  const day = nowIso.slice(0, 10);
  const ref = db.collection("company_group_activity").doc(`${companyId}__${userId}__${day}`);
  const existing = (await ref.get()).data() as {
    seconds?: number;
    last_recorded_at?: string;
  } | undefined;
  const lastRecordedAt = existing?.last_recorded_at ? Date.parse(existing.last_recorded_at) : 0;
  if (Number.isFinite(lastRecordedAt) && now.getTime() - lastRecordedAt < 45_000) {
    return { ok: true as const, recorded: false as const };
  }
  const totalSeconds = Math.min(8 * 60 * 60, Math.max(0, Number(existing?.seconds ?? 0)) + seconds);
  await ref.set({
    id: `${companyId}__${userId}__${day}`,
    company_id: companyId,
    user_id: userId,
    day,
    seconds: totalSeconds,
    last_recorded_at: nowIso,
  }, { merge: true });
  return { ok: true as const, recorded: true as const };
}

async function ensureGroupExists(company: CompanyRecord) {
  const ref = getFirestoreDb().collection("company_groups").doc(company.id);
  const snap = await ref.get();
  if (!snap.exists) {
    const now = new Date().toISOString();
    await ref.set({
      id: company.id,
      company_id: company.id,
      company_name: company.name,
      company_slug: company.slug,
      industry: company.industry ?? null,
      rules: [...COMPANY_GROUP_DEFAULT_RULES],
      lead_moderator_id: null,
      created_at: now,
      updated_at: now,
    });
  }
  return ref;
}

export async function requestCompanyGroupJoin(companyId: string, userId: string) {
  const company = await readCompany(companyId);
  if (!company) throw new Error("Company not found.");
  const db = getFirestoreDb();
  const profileSnap = await db.collection("profiles").doc(userId).get();
  const profile = profileSnap.data() as ProfileRecord | undefined;
  if (profile?.account_type === "company") throw new Error("Company accounts can’t join worker groups.");
  const membershipRef = db.collection("company_group_members").doc(memberId(companyId, userId));
  const existingMembership = (await membershipRef.get()).data() as CompanyGroupMember | undefined;
  if (existingMembership?.status === "active") return { status: "active" as const };
  const requestRef = db.collection("company_group_join_requests").doc(memberId(companyId, userId));
  const existing = await requestRef.get();
  if ((existing.data() as { status?: string } | undefined)?.status === "pending") {
    return { status: "pending" as const };
  }
  const now = new Date().toISOString();
  await ensureGroupExists(company);
  await requestRef.set({
    id: memberId(companyId, userId),
    company_id: companyId,
    user_id: userId,
    status: "pending",
    created_at: now,
    updated_at: now,
  });
  return { status: "pending" as const };
}

export async function decideCompanyGroupJoin(
  companyId: string,
  targetUserId: string,
  actorId: string,
  decision: "approve" | "decline",
) {
  await assertModerator(companyId, actorId);
  const db = getFirestoreDb();
  const requestRef = db.collection("company_group_join_requests").doc(memberId(companyId, targetUserId));
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists || requestSnap.get("status") !== "pending") {
    throw new Error("That join request is no longer waiting.");
  }
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.update(requestRef, { status: decision === "approve" ? "approved" : "declined", decided_at: now, decided_by: actorId });
  if (decision === "approve") {
    batch.set(db.collection("company_group_members").doc(memberId(companyId, targetUserId)), {
      id: memberId(companyId, targetUserId),
      company_id: companyId,
      user_id: targetUserId,
      role: "member",
      status: "active",
      source: "approved_request",
      joined_at: now,
    });
  }
  const auditId = crypto.randomUUID();
  batch.set(db.collection("company_group_audit").doc(auditId), {
    id: auditId,
    company_id: companyId,
    actor_id: actorId,
    target_user_id: targetUserId,
    action: decision === "approve" ? "join_approved" : "join_declined",
    created_at: now,
  });
  await batch.commit();
  return { ok: true as const };
}

export async function leaveCompanyGroup(companyId: string, userId: string) {
  const ref = getFirestoreDb().collection("company_group_members").doc(memberId(companyId, userId));
  const snapshot = await ref.get();
  const member = snapshot.data() as CompanyGroupMember | undefined;
  if (!member || member.status !== "active") return { ok: true as const };
  if (member.role === "lead_moderator") {
    throw new Error("Choose a new lead moderator before leaving this group.");
  }
  await ref.update({ status: "left", left_at: new Date().toISOString() });
  return { ok: true as const };
}

export async function createCompanyGroupPost(input: {
  companyId: string;
  userId: string;
  body: string;
  anonymous: boolean;
}) {
  const body = input.body.trim();
  if (body.length < 12 || body.length > MAX_GROUP_POST_LENGTH) {
    throw new Error(`Write between 12 and ${MAX_GROUP_POST_LENGTH} characters.`);
  }
  const company = await readCompany(input.companyId);
  if (!company) throw new Error("Company not found.");
  const db = getFirestoreDb();
  const [profileSnap, memberSnap, verificationSnap] = await Promise.all([
    db.collection("profiles").doc(input.userId).get(),
    db.collection("company_group_members").doc(memberId(input.companyId, input.userId)).get(),
    db.collection("account_verifications").doc(input.userId).get(),
  ]);
  const profile = profileSnap.data() as ProfileRecord | undefined;
  const member = memberSnap.data() as CompanyGroupMember | undefined;
  const verification = verificationSnap.data() as { account_type?: string; company_id?: string | null; owner_verified?: boolean } | undefined;
  let authorKind: CompanyGroupPost["author_kind"] = "member";
  if (profile?.account_type === "company") {
    if (getEffectiveMembershipTier(profile) !== "premium") {
      throw new Error("Company accounts need Premium to publish. You can still read every public story.");
    }
    if (
      verification?.account_type !== "company" ||
      verification.owner_verified !== true ||
      verification.company_id !== input.companyId
    ) {
      throw new Error("A verified company account can publish only to its own company page.");
    }
    authorKind = "official_company";
  } else if (member?.status !== "active") {
    throw new Error("Join this company group before starting a discussion.");
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await ensureGroupExists(company);
  await db.collection("company_group_posts").doc(id).set({
    id,
    company_id: input.companyId,
    author_id: input.userId,
    author_username: input.anonymous ? null : profile?.username ?? profile?.handle ?? null,
    author_photo_url: input.anonymous ? null : profile?.photo_url ?? null,
    author_kind: authorKind,
    is_anonymous: input.anonymous,
    body,
    status: "published",
    moderation_reason: null,
    created_at: now,
  } satisfies CompanyGroupPost);
  return { id };
}

export async function moderateCompanyGroupPost(input: {
  companyId: string;
  postId: string;
  actorId: string;
  reason: string;
}) {
  await assertModerator(input.companyId, input.actorId);
  const db = getFirestoreDb();
  const ref = db.collection("company_group_posts").doc(input.postId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("company_id") !== input.companyId) throw new Error("Post not found.");
  if (snap.get("author_kind") === "official_company" && !(await isOfficialAccount(input.actorId))) {
    throw new Error("Only Candid can moderate an official company update.");
  }
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.update(ref, { status: "hidden", moderation_reason: input.reason.trim(), hidden_at: now, hidden_by: input.actorId });
  batch.set(db.collection("company_group_audit").doc(), {
    id: crypto.randomUUID(), company_id: input.companyId, actor_id: input.actorId,
    target_id: input.postId, action: "discussion_hidden", reason: input.reason.trim(), created_at: now,
  });
  await batch.commit();
  return { ok: true as const };
}

export async function removeCompanyGroupMember(input: {
  companyId: string;
  targetUserId: string;
  actorId: string;
  reason: string;
}) {
  await assertModerator(input.companyId, input.actorId);
  if (input.targetUserId === input.actorId) throw new Error("Use Leave group to remove yourself.");
  const db = getFirestoreDb();
  const targetRef = db.collection("company_group_members").doc(memberId(input.companyId, input.targetUserId));
  const targetSnap = await targetRef.get();
  const target = targetSnap.data() as CompanyGroupMember | undefined;
  if (target?.status !== "active") throw new Error("That member is no longer active.");
  if (target.role !== "member") throw new Error("Only Candid can remove a moderator.");
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.update(targetRef, { status: "removed", removed_at: now, removed_by: input.actorId, removal_reason: input.reason.trim() });
  batch.set(db.collection("company_group_audit").doc(), {
    id: crypto.randomUUID(), company_id: input.companyId, actor_id: input.actorId,
    target_user_id: input.targetUserId, action: "member_removed", reason: input.reason.trim(), created_at: now,
  });
  await batch.commit();
  return { ok: true as const };
}

export async function updateCompanyGroupRules(companyId: string, actorId: string, rules: string[]) {
  await assertModerator(companyId, actorId);
  const normalized = [...new Set(rules.map((rule) => rule.trim()).filter(Boolean))];
  if (!normalized.length || normalized.length > MAX_GROUP_RULES || normalized.some((rule) => rule.length > 240)) {
    throw new Error(`Add 1–${MAX_GROUP_RULES} rules, each no longer than 240 characters.`);
  }
  const company = await readCompany(companyId);
  if (!company) throw new Error("Company not found.");
  const now = new Date().toISOString();
  const ref = await ensureGroupExists(company);
  await ref.set({ rules: normalized, updated_at: now }, { merge: true });
  await getFirestoreDb().collection("company_group_audit").doc().set({
    id: crypto.randomUUID(), company_id: companyId, actor_id: actorId, action: "rules_updated", created_at: now,
  });
  return { rules: normalized };
}

export async function applyToModerateCompanyGroup(companyId: string, userId: string, note: string) {
  const db = getFirestoreDb();
  const [profileSnap, identitySnap, memberSnap] = await Promise.all([
    db.collection("profiles").doc(userId).get(),
    db.collection("moderator_identity_verifications").doc(userId).get(),
    db.collection("company_group_members").doc(memberId(companyId, userId)).get(),
  ]);
  const profile = profileSnap.data() as ProfileRecord | undefined;
  if (profile?.account_type === "company") throw new Error("Company accounts can’t moderate worker groups.");
  if (identitySnap.get("status") !== "approved") throw new Error("Complete Candid’s moderator identity check before applying.");
  const member = memberSnap.data() as CompanyGroupMember | undefined;
  if (member?.status !== "active") throw new Error("Join this company group before applying to moderate it.");
  if (member.role === "moderator" || member.role === "lead_moderator") throw new Error("You already moderate this group.");
  const company = await readCompany(companyId);
  if (!company) throw new Error("Company not found.");
  const id = memberId(companyId, userId);
  const ref = db.collection("company_moderator_applications").doc(id);
  const existing = await ref.get();
  if ((existing.data() as { status?: string } | undefined)?.status === "pending") {
    return { ok: true as const, status: "pending" as const };
  }
  const now = new Date().toISOString();
  await ref.set({
    id,
    company_id: companyId,
    company_name: company.name,
    company_slug: company.slug,
    user_id: userId,
    note: note.trim().slice(0, 1000),
    status: "pending",
    created_at: now,
    updated_at: now,
  });
  return { ok: true as const, status: "pending" as const };
}

export async function endorseCompanyModerator(companyId: string, candidateId: string, userId: string) {
  if (candidateId === userId) throw new Error("You can’t vouch for your own application.");
  const db = getFirestoreDb();
  const [memberSnap, applicationSnap, identitySnap] = await Promise.all([
    db.collection("company_group_members").doc(memberId(companyId, userId)).get(),
    db.collection("company_moderator_applications").doc(memberId(companyId, candidateId)).get(),
    db.collection("moderator_identity_verifications").doc(candidateId).get(),
  ]);
  const member = memberSnap.data() as CompanyGroupMember | undefined;
  if (member?.status !== "active") throw new Error("Join the group before vouching for a moderator.");
  if (applicationSnap.get("status") !== "pending") throw new Error("That application is not open.");
  if (identitySnap.get("status") !== "approved") throw new Error("This candidate has not passed Candid’s identity check yet.");
  const id = `${companyId}__${candidateId}__${userId}`;
  const ref = db.collection("company_moderator_endorsements").doc(id);
  const existing = await ref.get();
  if (existing.exists) return { endorsed: true as const, alreadyEndorsed: true as const };
  await ref.set({ id, company_id: companyId, candidate_id: candidateId, user_id: userId, created_at: new Date().toISOString() });
  return { endorsed: true as const, alreadyEndorsed: false as const };
}

export async function listCompanyGroupModerationQueue(companyId: string, actorId: string) {
  await assertModerator(companyId, actorId);
  const db = getFirestoreDb();
  const [joinSnap, applicationsSnap, groupSnap] = await Promise.all([
    db.collection("company_group_join_requests").where("company_id", "==", companyId).get(),
    db.collection("company_moderator_applications").where("company_id", "==", companyId).get(),
    db.collection("company_groups").doc(companyId).get(),
  ]);
  const joins = joinSnap.docs.filter((doc) => doc.get("status") === "pending");
  const applications = applicationsSnap.docs.filter((doc) => doc.get("status") === "pending");
  const [joinProfiles, applicationRows] = await Promise.all([
    Promise.all(joins.map(async (doc) => {
      const userId = String(doc.get("user_id") ?? "");
      const profile = await db.collection("profiles").doc(userId).get();
      return { user_id: userId, username: safeUsername(profile.data() as ProfileRecord | undefined) ?? "Private member", created_at: String(doc.get("created_at") ?? "") };
    })),
    Promise.all(applications.map(async (doc) => {
      const userId = String(doc.get("user_id") ?? "");
      const [profileSnap, identitySnap, endorsements, stories, posts, activity, groupActivity] = await Promise.all([
        db.collection("profiles").doc(userId).get(),
        db.collection("moderator_identity_verifications").doc(userId).get(),
        db.collection("company_moderator_endorsements").where("company_id", "==", companyId).where("candidate_id", "==", userId).get(),
        db.collection("stories").where("company_id", "==", companyId).where("author_id", "==", userId).get(),
        db.collection("company_group_posts").where("company_id", "==", companyId).where("author_id", "==", userId).get(),
        db.collection("account_activity_days").where("user_id", "==", userId).get(),
        db.collection("company_group_activity").where("company_id", "==", companyId).where("user_id", "==", userId).get(),
      ]);
      if (identitySnap.get("status") !== "approved") return null;
      const profile = profileSnap.data() as ProfileRecord | undefined;
      const activeDays = activity.docs.filter((day) => String(day.get("day") ?? "") >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)).length;
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const groupSeconds = groupActivity.docs
        .filter((day) => String(day.get("day") ?? "") >= since)
        .reduce((sum, day) => sum + Math.max(0, Number(day.get("seconds") ?? 0)), 0);
      const contributions = stories.docs.filter((story) => story.get("status") === "published").length +
        posts.docs.filter((post) => post.get("status") === "published").length;
      const recommendationScore = endorsements.size * 4 + contributions * 2 + activeDays + Math.floor(groupSeconds / 900);
      return {
        user_id: userId,
        username: safeUsername(profile) ?? "Private member",
        photo_url: safeUsername(profile) ? profile?.photo_url ?? null : null,
        note: String(doc.get("note") ?? ""),
        created_at: String(doc.get("created_at") ?? ""),
        endorsements: endorsements.size,
        contributions,
        active_days: activeDays,
        group_minutes: Math.floor(groupSeconds / 60),
        recommendation_score: recommendationScore,
        recommended: false,
      };
    })),
  ]);
  const verifiedApplications = applicationRows.filter((row): row is NonNullable<typeof row> => row !== null);
  const suggested = [...verifiedApplications].sort((a, b) => b.recommendation_score - a.recommendation_score || b.contributions - a.contributions || b.endorsements - a.endorsements)[0];
  return {
    joins: joinProfiles,
    applications: verifiedApplications.map((row) => ({ ...row, recommended: row.user_id === suggested?.user_id })),
    lead_moderator_id: String(groupSnap.get("lead_moderator_id") ?? "") || null,
  };
}

export async function decideCompanyModeratorApplication(input: {
  companyId: string;
  candidateId: string;
  actorId: string;
  decision: "approve" | "decline";
}) {
  const isOfficial = await isOfficialAccount(input.actorId);
  const isModerator = await isGroupModerator(input.companyId, input.actorId);
  if (!isOfficial && !isModerator) throw new Error("Only a company group moderator or Candid can decide applications.");
  const db = getFirestoreDb();
  const applicationRef = db.collection("company_moderator_applications").doc(memberId(input.companyId, input.candidateId));
  const application = await applicationRef.get();
  if (!application.exists || application.get("status") !== "pending") throw new Error("That application is no longer open.");
  const memberRef = db.collection("company_group_members").doc(memberId(input.companyId, input.candidateId));
  const groupRef = db.collection("company_groups").doc(input.companyId);
  const [memberSnap, initialGroupSnap, identitySnap] = await Promise.all([
    memberRef.get(),
    groupRef.get(),
    db.collection("moderator_identity_verifications").doc(input.candidateId).get(),
  ]);
  if (input.decision === "approve" && memberSnap.get("status") !== "active") throw new Error("The applicant must be an active group member.");
  if (input.decision === "approve" && identitySnap.get("status") !== "approved") throw new Error("The candidate must pass Candid’s identity check first.");
  const company = await readCompany(input.companyId);
  if (!company) throw new Error("Company not found.");
  if (!initialGroupSnap.exists) await ensureGroupExists(company);
  const groupSnap = initialGroupSnap.exists ? initialGroupSnap : await groupRef.get();
  const now = new Date().toISOString();
  const activeModerators = (await db.collection("company_group_members").where("company_id", "==", input.companyId).get()).docs
    .filter((doc) => doc.get("status") === "active" && ["moderator", "lead_moderator"].includes(String(doc.get("role"))));
  const batch = db.batch();
  batch.update(applicationRef, { status: input.decision === "approve" ? "approved" : "declined", decided_at: now, decided_by: input.actorId }, application.updateTime ? { updateTime: application.updateTime } : undefined);
  if (input.decision === "approve") {
    for (const moderator of activeModerators) {
      if (moderator.id !== memberRef.id) batch.update(moderator.ref, { role: "member", previous_moderator_since: moderator.get("moderator_since") ?? null });
    }
    batch.update(memberRef, { role: "lead_moderator", moderator_since: now }, memberSnap.updateTime ? { updateTime: memberSnap.updateTime } : undefined);
    batch.update(groupRef, { lead_moderator_id: input.candidateId, updated_at: now }, groupSnap.updateTime ? { updateTime: groupSnap.updateTime } : undefined);
  }
  const auditId = crypto.randomUUID();
  batch.set(db.collection("company_group_audit").doc(auditId), {
    id: auditId, company_id: input.companyId, actor_id: input.actorId,
    target_user_id: input.candidateId, action: input.decision === "approve" ? "moderator_selected" : "moderator_declined", created_at: now,
  });
  await batch.commit();
  return { status: input.decision === "approve" ? "approved" as const : "declined" as const, role: input.decision === "approve" ? "lead_moderator" as const : null };
}

export async function getModeratorForumAccess(userId: string) {
  const db = getFirestoreDb();
  const [profileSnap, memberSnap, applicationsSnap, configSnap] = await Promise.all([
    db.collection("profiles").doc(userId).get(),
    db.collection("company_group_members").where("user_id", "==", userId).get(),
    db.collection("company_moderator_applications").where("user_id", "==", userId).get(),
    db.collection("app_config").doc("moderator-executive").get(),
  ]);
  const profile = profileSnap.data() as ProfileRecord | undefined;
  const activeRoles = memberSnap.docs.filter((doc) => doc.get("status") === "active" && ["moderator", "lead_moderator"].includes(String(doc.get("role"))));
  const applications = applicationsSnap.docs.filter((doc) => doc.get("status") !== "withdrawn");
  const isOfficial = profile?.account_type === "official";
  const executiveId = String(configSnap.get("user_id") ?? "");
  const isExecutive = executiveId === userId;
  const allowed = isOfficial || isExecutive || activeRoles.length > 0 || applications.length > 0;
  return {
    allowed,
    is_official: isOfficial,
    is_executive: isExecutive,
    moderator_count: activeRoles.length,
    application_count: applications.length,
    role: isOfficial ? "Candid staff" : isExecutive ? "Executive moderator" : activeRoles.length ? "Group moderator" : applications.length ? "Moderator applicant" : null,
  };
}

export async function listExecutiveModeratorCandidates(actorId: string) {
  if (!(await isOfficialAccount(actorId))) throw new Error("Only Candid can manage the executive moderator.");
  const db = getFirestoreDb();
  const [members, applications, config] = await Promise.all([
    db.collection("company_group_members").get(),
    db.collection("company_moderator_applications").get(),
    db.collection("app_config").doc("moderator-executive").get(),
  ]);
  const candidateIds = new Set<string>();
  for (const doc of members.docs) {
    if (doc.get("status") === "active" && ["moderator", "lead_moderator"].includes(String(doc.get("role")))) {
      candidateIds.add(String(doc.get("user_id") ?? ""));
    }
  }
  for (const doc of applications.docs) {
    if (doc.get("status") !== "withdrawn") candidateIds.add(String(doc.get("user_id") ?? ""));
  }
  candidateIds.delete("");
  const candidates = await Promise.all([...candidateIds].map(async (userId) => {
    const profile = (await db.collection("profiles").doc(userId).get()).data() as ProfileRecord | undefined;
    const roles = members.docs.filter((doc) => doc.get("user_id") === userId && doc.get("status") === "active" && ["moderator", "lead_moderator"].includes(String(doc.get("role"))));
    const candidateApplications = applications.docs.filter((doc) => doc.get("user_id") === userId && doc.get("status") !== "withdrawn");
    const groupNames = await Promise.all(roles.map(async (doc) => {
      const group = await db.collection("company_groups").doc(String(doc.get("company_id") ?? "")).get();
      return String(group.get("company_name") ?? "Company group");
    }));
    return {
      user_id: userId,
      username: safeUsername(profile) ?? "Private member",
      groups: groupNames,
      application_count: candidateApplications.length,
      is_active_moderator: roles.length > 0,
    };
  }));
  return {
    current_user_id: String(config.get("user_id") ?? "") || null,
    candidates: candidates.sort((a, b) => Number(b.is_active_moderator) - Number(a.is_active_moderator) || a.username.localeCompare(b.username)),
  };
}

export async function listModeratorForumPosts(userId: string) {
  const access = await getModeratorForumAccess(userId);
  if (!access.allowed) throw new Error("Apply to moderate a company group to enter the forum.");
  const docs = await getFirestoreDb().collection("moderator_forum_posts").limit(100).get();
  const rows = await Promise.all(
    docs.docs.map(async (doc) => {
      const data = doc.data() as { id: string; author_id: string; body: string; created_at: string };
      const profileSnap = await getFirestoreDb().collection("profiles").doc(data.author_id).get();
      const profile = profileSnap.data() as ProfileRecord | undefined;
      return {
        id: doc.id,
        author_id: data.author_id,
        author_username: access.is_official || access.is_executive || data.author_id === userId
          ? safeUsername(profile) ?? "Private member"
          : profile?.profile_visibility === "private" ? "Private member" : safeUsername(profile) ?? "Private member",
        body: data.body,
        created_at: data.created_at,
      };
    }),
  );
  return { access, posts: rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50) };
}

export async function createModeratorForumPost(userId: string, bodyInput: string) {
  const access = await getModeratorForumAccess(userId);
  if (!access.allowed) throw new Error("Apply to moderate a company group to post in the forum.");
  const body = bodyInput.trim();
  if (body.length < 3 || body.length > 3000) throw new Error("Write between 3 and 3,000 characters.");
  const profileSnap = await getFirestoreDb().collection("profiles").doc(userId).get();
  const profile = profileSnap.data() as ProfileRecord | undefined;
  const id = crypto.randomUUID();
  await getFirestoreDb().collection("moderator_forum_posts").doc(id).set({
    id, author_id: userId, body, created_at: new Date().toISOString(),
    author_username: profile?.username ?? profile?.handle ?? "Member",
  });
  return { id };
}

export async function getModeratorCouncilMessages(userId: string) {
  const access = await getModeratorForumAccess(userId);
  if (!access.is_official && !access.is_executive) throw new Error("This Candid channel is for the executive moderator and Candid only.");
  const threadId = "executive-moderator";
  const snapshot = await getFirestoreDb().collection("moderator_council_messages").where("thread_id", "==", threadId).get();
  const messages = await Promise.all(snapshot.docs.map(async (doc) => {
    const data = doc.data() as { sender_id: string; body: string; action_type?: string; created_at: string };
    const profile = (await getFirestoreDb().collection("profiles").doc(data.sender_id).get()).data() as ProfileRecord | undefined;
    return { id: doc.id, sender_id: data.sender_id, sender_label: access.is_official || access.is_executive ? safeUsername(profile) ?? "Candid staff" : "Candid team", body: data.body, action_type: data.action_type ?? "update", created_at: data.created_at };
  }));
  return messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function sendModeratorCouncilMessage(input: { userId: string; body: string; actionType: string }) {
  const access = await getModeratorForumAccess(input.userId);
  if (!access.is_official && !access.is_executive) throw new Error("This Candid channel is for the executive moderator and Candid only.");
  const body = input.body.trim();
  if (body.length < 2 || body.length > 4000) throw new Error("Write between 2 and 4,000 characters.");
  const allowedActions = new Set(["report", "policy", "safety", "question", "update"]);
  if (!allowedActions.has(input.actionType)) throw new Error("Choose a valid message type.");
  const id = crypto.randomUUID();
  await getFirestoreDb().collection("moderator_council_messages").doc(id).set({
    id, thread_id: "executive-moderator", sender_id: input.userId, body,
    action_type: input.actionType, created_at: new Date().toISOString(),
  });
  return { id };
}

export async function appointExecutiveModerator(actorId: string, targetUserId: string | null) {
  if (!(await isOfficialAccount(actorId))) throw new Error("Only Candid can appoint the executive moderator.");
  if (targetUserId) {
    const access = await getModeratorForumAccess(targetUserId);
    if (!access.allowed || access.is_official) throw new Error("Choose an active group moderator or moderator applicant.");
  }
  await getFirestoreDb().collection("app_config").doc("moderator-executive").set({
    user_id: targetUserId,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  });
  return { ok: true as const };
}

export async function getMyCompanyAccountApplication(userId: string) {
  const db = getFirestoreDb();
  const snap = await db.collection("company_account_applications").where("user_id", "==", userId).limit(1).get();
  if (snap.empty) return null;
  const data = snap.docs[0]!.data();
  const company = typeof data["company_id"] === "string" ? await readCompany(data["company_id"]) : null;
  return {
    id: snap.docs[0]!.id,
    company_id: String(data["company_id"] ?? ""),
    company_name: company?.name ?? String(data["company_name"] ?? "Company"),
    company_slug: company?.slug ?? String(data["company_slug"] ?? ""),
    role_title: String(data["role_title"] ?? ""),
    status: String(data["status"] ?? "pending"),
    created_at: String(data["created_at"] ?? ""),
    review_note: String(data["review_note"] ?? ""),
  };
}

export async function submitCompanyAccountApplication(input: {
  userId: string;
  companyId: string;
  roleTitle: string;
  website: string;
  registrationNumber: string;
  emailDomain: string | null;
}) {
  const db = getFirestoreDb();
  const profileSnap = await db.collection("profiles").doc(input.userId).get();
  const profile = profileSnap.data() as ProfileRecord | undefined;
  if (profile?.account_type !== "company") throw new Error("Choose a company account first.");
  const company = await readCompany(input.companyId);
  if (!company) throw new Error("Choose a company already listed in Candid.");
  if (!input.roleTitle.trim()) throw new Error("Add your role at the company.");
  const companySnap = await db.collection("companies").doc(input.companyId).get();
  const claimedBy = companySnap.get("claimed_by");
  if (claimedBy && claimedBy !== input.userId) throw new Error("This company page is already managed by another account.");
  const existing = await db.collection("company_account_applications").where("user_id", "==", input.userId).limit(1).get();
  const existingRecord = existing.docs[0]?.data() as { status?: string } | undefined;
  if (existingRecord?.status === "pending_review") return { id: existing.docs[0]!.id, status: "pending_review" as const };
  const id = `${input.companyId}__${input.userId}`;
  const now = new Date().toISOString();
  await db.collection("company_account_applications").doc(id).set({
    id,
    user_id: input.userId,
    company_id: input.companyId,
    company_name: company.name,
    company_slug: company.slug,
    role_title: input.roleTitle.trim().slice(0, 120),
    company_website: input.website.trim(),
    registration_number: input.registrationNumber.trim().slice(0, 80),
    verified_email_domain: input.emailDomain,
    status: "pending_review",
    review_note: null,
    created_at: now,
    updated_at: now,
  });
  return { id, status: "pending_review" as const };
}

async function assertCandidOfficial(userId: string) {
  if (!(await isOfficialAccount(userId))) throw new Error("Only the official Candid account can review company accounts.");
}

export async function listCompanyAccountApplications(userId: string) {
  await assertCandidOfficial(userId);
  const snapshot = await getFirestoreDb().collection("company_account_applications").get();
  return snapshot.docs
    .map((doc) => ({ ...(doc.data() as Record<string, unknown>), id: doc.id }))
    .filter((record) => record["status"] === "pending_review")
    .sort((a, b) => String(a["created_at"] ?? "").localeCompare(String(b["created_at"] ?? "")));
}

export async function reviewCompanyAccountApplication(input: {
  actorId: string;
  applicationId: string;
  decision: "approve" | "decline";
  note: string;
}) {
  await assertCandidOfficial(input.actorId);
  const db = getFirestoreDb();
  const applicationRef = db.collection("company_account_applications").doc(input.applicationId);
  const applicationSnap = await applicationRef.get();
  if (!applicationSnap.exists || applicationSnap.get("status") !== "pending_review") throw new Error("That company request is no longer pending.");
  const companyId = String(applicationSnap.get("company_id") ?? "");
  const userId = String(applicationSnap.get("user_id") ?? "");
  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) throw new Error("The company page no longer exists.");
  if (input.decision === "approve" && companySnap.get("claimed_by") && companySnap.get("claimed_by") !== userId) {
    throw new Error("Another account has already claimed this company page.");
  }
  const company = companySnap.data() as CompanyRecord;
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.update(applicationRef, {
    status: input.decision === "approve" ? "approved" : "declined",
    review_note: input.note.trim().slice(0, 1000) || null,
    reviewed_by: input.actorId,
    reviewed_at: now,
    updated_at: now,
  });
  if (input.decision === "approve") {
    batch.update(companyRef, { claimed_by: userId, verified: true, company_account_status: "claimed" });
    batch.set(db.collection("account_verifications").doc(userId), {
      user_id: userId,
      account_type: "company",
      badge_status: "claimed",
      company_id: companyId,
      company_name: company.name,
      company_slug: company.slug,
      owner_override: "company",
      owner_verified: true,
      approval_status: "approved",
      requested_at: now,
      snoozed_until: null,
      claimed_at: now,
      checked_at: now,
    }, { merge: true });
    batch.set(db.collection("profiles").doc(userId), {
      account_type: "company",
      company_account_id: companyId,
      company_account_status: "verified",
      verified: true,
    }, { merge: true });
  }
  await batch.commit();
  return { status: input.decision === "approve" ? "approved" as const : "declined" as const };
}

export async function suggestCompanyTagCorrection(input: {
  storyId: string;
  fromCompanyId: string;
  toCompanyId: string;
  actorId: string;
  reason: string;
}) {
  await assertModerator(input.fromCompanyId, input.actorId);
  if (input.fromCompanyId === input.toCompanyId) throw new Error("Choose a different company.");
  const db = getFirestoreDb();
  const storyRef = db.collection("stories").doc(input.storyId);
  const [storySnap, fromCompany, toCompany] = await Promise.all([
    storyRef.get(), readCompany(input.fromCompanyId), readCompany(input.toCompanyId),
  ]);
  const story = storySnap.data() as StoryRecord | undefined;
  if (!story || story.company_id !== input.fromCompanyId || story.post_type === "announcement") throw new Error("That story can’t be retagged from this group.");
  if (!toCompany) throw new Error("Choose a listed company.");
  const existing = await db.collection("company_tag_corrections").where("story_id", "==", input.storyId).where("status", "in", ["pending_target_moderator", "pending_author"]).limit(1).get();
  if (!existing.empty) throw new Error("There is already an open tag suggestion for this story.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.collection("company_tag_corrections").doc(id).set({
    id, story_id: input.storyId, author_id: story.author_id,
    from_company_id: input.fromCompanyId, from_company_name: fromCompany?.name ?? story.company_name,
    to_company_id: toCompany.id, to_company_name: toCompany.name,
    suggested_by: input.actorId, reason: input.reason.trim().slice(0, 700),
    status: "pending_target_moderator", created_at: now, updated_at: now,
  });
  return { id };
}

export async function listCompanyTagCorrections(companyId: string, viewerId: string) {
  const db = getFirestoreDb();
  const [incoming, outgoing, byAuthor] = await Promise.all([
    db.collection("company_tag_corrections").where("to_company_id", "==", companyId).get(),
    db.collection("company_tag_corrections").where("from_company_id", "==", companyId).get(),
    db.collection("company_tag_corrections").where("author_id", "==", viewerId).get(),
  ]);
  const moderator = await isGroupModerator(companyId, viewerId);
  const all = new Map<string, Record<string, unknown>>();
  for (const doc of [...incoming.docs, ...outgoing.docs, ...byAuthor.docs]) all.set(doc.id, { ...(doc.data() as Record<string, unknown>), id: doc.id });
  return [...all.values()].filter((row) => {
    const status = row["status"];
    if (status === "complete" || status === "declined" || status === "cancelled") return false;
    return moderator || row["author_id"] === viewerId;
  });
}

export async function decideCompanyTagCorrection(input: {
  correctionId: string;
  actorId: string;
  decision: "approve" | "decline";
}) {
  const db = getFirestoreDb();
  const ref = db.collection("company_tag_corrections").doc(input.correctionId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Tag suggestion not found.");
  const data = snap.data() as Record<string, unknown>;
  const now = new Date().toISOString();
  if (data["status"] === "pending_target_moderator") {
    if (!(await isGroupModerator(String(data["to_company_id"]), input.actorId))) throw new Error("Only the other company’s moderator can review this suggestion.");
    await ref.update({ status: input.decision === "approve" ? "pending_author" : "declined", target_reviewed_by: input.actorId, target_reviewed_at: now, updated_at: now });
    return { status: input.decision === "approve" ? "pending_author" as const : "declined" as const };
  }
  if (data["status"] !== "pending_author" || data["author_id"] !== input.actorId) throw new Error("Only the story’s author can approve the final tag change.");
  if (input.decision === "decline") {
    await ref.update({ status: "declined", author_decided_at: now, updated_at: now });
    return { status: "declined" as const };
  }
  const [storyRef, targetCompany] = await Promise.all([
    Promise.resolve(db.collection("stories").doc(String(data["story_id"]))),
    readCompany(String(data["to_company_id"])),
  ]);
  const storySnap = await storyRef.get();
  if (!storySnap.exists || !targetCompany) throw new Error("The story or company is no longer available.");
  const batch = db.batch();
  batch.update(storyRef, { company_id: targetCompany.id, company_name: targetCompany.name, company_slug: targetCompany.slug, industry: targetCompany.industry ?? null, updated_at: now });
  batch.update(ref, { status: "complete", author_decided_at: now, updated_at: now });
  await batch.commit();
  return { status: "complete" as const };
}

export async function getUserCompanyAccountType(userId: string) {
  const snap = await getFirestoreDb().collection("profiles").doc(userId).get();
  const profile = snap.data() as ProfileRecord | undefined;
  return profile?.account_type ?? "unknown";
}

