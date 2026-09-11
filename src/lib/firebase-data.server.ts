import { randomUUID } from "node:crypto";
import type { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getFirestoreDb } from "./firebase.server";

export type CompanyRecord = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  county: string | null;
  verified: boolean;
  created_at: string;
};

export type CompanyAIProfileRecord = {
  company_id: string;
  summary: string | null;
  descriptor: string | null;
  industry: string | null;
  headquarters: string | null;
  size_band: string | null;
  founded_year: number | null;
  typical_roles: string[] | null;
  reputation_notes: string | null;
  employment_context: string | null;
  generated_at: string;
  model: string | null;
  locked: boolean;
};

export type ProfileSocials = {
  x: string | null;
  instagram: string | null;
  linkedin: string | null;
  tiktok: string | null;
  website: string | null;
};

export type ProfileRecord = {
  id: string;
  handle: string;
  county: string | null;
  banned: boolean;
  created_at: string;
  role_label: string | null;
  username?: string | null;
  socials?: ProfileSocials | null;
  account_type?: "individual" | "company" | "unknown";
  onboarded_at?: string | null;
};

export type StoryRecord = {
  id: string;
  company_id: string;
  company_name: string | null;
  company_slug: string | null;
  title: string;
  body: string;
  reasons: string[];
  role_level: string | null;
  county: string | null;
  tenure: string | null;
  industry: string | null;
  would_work_again: boolean | null;
  author_id: string | null;
  status: "published" | "pending" | "hidden";
  moderation_note: string | null;
  upvotes: number;
  metoo: number;
  comment_count: number;
  created_at: string;
};

export type CommentRecord = {
  id: string;
  story_id: string;
  parent_id: string | null;
  body: string;
  status: string;
  author_id: string | null;
  author_handle: string;
  author_username?: string | null;
  author_verified?: boolean;
  is_official?: boolean;
  likes?: number;
  created_at: string;
};

export type PublicComment = CommentRecord & {
  author_username: string | null;
  author_verified: boolean;
  is_official: boolean;
  likes: number;
  replies: PublicComment[];
};


export type VoteRecord = {
  id: string;
  story_id: string;
  user_id: string;
  kind: "up" | "metoo";
  created_at: string;
};

export type ReportRecord = {
  id: string;
  target_type: "story" | "comment";
  target_id: string;
  reason: string;
  detail: string | null;
  reporter_id: string | null;
  status: string;
  created_at: string;
};

export type SalaryReportRecord = {
  id: string;
  company_id: string | null;
  role_title: string;
  industry: string | null;
  county: string | null;
  min_kes: number;
  max_kes: number;
  user_id: string | null;
  created_at: string;
};

export type CompanyRatingRecord = {
  id: string;
  company_id: string;
  pay_on_time: number;
  compliance: number;
  respect: number;
  workload: number;
  growth: number;
  would_work_again: boolean;
  user_id: string | null;
  created_at: string;
};

export type OwnerAuditLogRecord = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: unknown;
  created_at: string;
};

export type CompanyScoreRecord = {
  company_id: string | null;
  name: string | null;
  slug: string | null;
  industry: string | null;
  county: string | null;
  story_count: number | null;
  rating_count: number | null;
  pay_on_time: number | null;
  compliance: number | null;
  respect: number | null;
  workload: number | null;
  growth: number | null;
  overall: number | null;
  would_work_again_pct: number | null;
  descriptor?: string | null;
};

export type SalaryAggregateRecord = {
  county: string | null;
  high_kes: number | null;
  industry: string | null;
  low_kes: number | null;
  mid_kes: number | null;
  reports: number | null;
  role_title: string | null;
};

function toRecord<T extends DocumentData>(snapshot: QueryDocumentSnapshot<DocumentData>): T {
  return { id: snapshot.id, ...(snapshot.data() as T) };
}

export async function readCollection<T extends DocumentData>(name: string) {
  const db = getFirestoreDb();
  const snapshot = await db.collection(name).get();
  return snapshot.docs.map((entry) => toRecord<T>(entry));
}

export async function readDocument<T extends DocumentData>(name: string, id: string) {
  const db = getFirestoreDb();
  const snapshot = await db.collection(name).doc(id).get();
  if (!snapshot.exists) return null;
  return { id: snapshot.id, ...(snapshot.data() as T) };
}

export async function queryFirst<T extends DocumentData>(
  name: string,
  field: string,
  value: string | boolean,
) {
  const db = getFirestoreDb();
  const snapshot = await db.collection(name).where(field, "==", value).get();
  const first = snapshot.docs[0];
  return first ? ({ id: first.id, ...(first.data() as T) } as T & { id: string }) : null;
}

export function generateId() {
  return randomUUID();
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export async function buildCompanyScores() {
  const [companies, stories, ratings, profiles] = await Promise.all([
    readCollection<CompanyRecord>("companies"),
    readCollection<StoryRecord>("stories"),
    readCollection<CompanyRatingRecord>("company_ratings"),
    readCollection<CompanyAIProfileRecord>("company_ai_profiles"),
  ]);

  const storiesByCompany = new Map<string, StoryRecord[]>();
  for (const story of stories) {
    if (!story.company_id) continue;
    const list = storiesByCompany.get(story.company_id) ?? [];
    list.push(story);
    storiesByCompany.set(story.company_id, list);
  }

  const ratingsByCompany = new Map<string, CompanyRatingRecord[]>();
  for (const rating of ratings) {
    const list = ratingsByCompany.get(rating.company_id) ?? [];
    list.push(rating);
    ratingsByCompany.set(rating.company_id, list);
  }

  const profileByCompany = new Map(
    profiles.map((profile) => [profile.company_id, profile] as const),
  );

  return companies.map<CompanyScoreRecord>((company) => {
    const companyStories = storiesByCompany.get(company.id) ?? [];
    const companyRatings = ratingsByCompany.get(company.id) ?? [];

    const metricFields: Array<
      keyof Pick<
        CompanyRatingRecord,
        "pay_on_time" | "compliance" | "respect" | "workload" | "growth"
      >
    > = ["pay_on_time", "compliance", "respect", "workload", "growth"];

    const metricAverages = Object.fromEntries(
      metricFields.map((field) => [
        field,
        average(companyRatings.map((rating) => Number(rating[field]))),
      ]),
    ) as Record<(typeof metricFields)[number], number | null>;

    const overall = average(
      metricFields
        .map((field) => metricAverages[field])
        .filter((value): value is number => typeof value === "number"),
    );
    const wouldWorkAgainPct =
      companyRatings.length === 0
        ? null
        : (companyRatings.filter((rating) => rating.would_work_again).length /
            companyRatings.length) *
          100;

    const profile = profileByCompany.get(company.id);

    return {
      company_id: company.id,
      name: company.name,
      slug: company.slug,
      industry: company.industry,
      county: company.county,
      story_count: companyStories.length,
      rating_count: companyRatings.length,
      pay_on_time: metricAverages.pay_on_time,
      compliance: metricAverages.compliance,
      respect: metricAverages.respect,
      workload: metricAverages.workload,
      growth: metricAverages.growth,
      overall,
      would_work_again_pct: wouldWorkAgainPct,
      descriptor: profile?.descriptor ?? null,
    } as CompanyScoreRecord & { descriptor: string | null };
  });
}

export async function buildSalaryAggregates() {
  const reports = await readCollection<SalaryReportRecord>("salary_reports");
  const groups = new Map<string, SalaryReportRecord[]>();
  for (const report of reports) {
    const key = [
      report.role_title.trim().toLowerCase(),
      report.industry ?? "",
      report.county ?? "",
    ].join("|");
    const list = groups.get(key) ?? [];
    list.push(report);
    groups.set(key, list);
  }

  const rows: SalaryAggregateRecord[] = [];
  for (const items of groups.values()) {
    if (items.length < 2) continue;
    const lows = items.map((item) => Number(item.min_kes));
    const highs = items.map((item) => Number(item.max_kes));
    const mids = items.map((item) => (Number(item.min_kes) + Number(item.max_kes)) / 2);
    rows.push({
      county: items[0]?.county ?? null,
      high_kes: Math.max(...highs),
      industry: items[0]?.industry ?? null,
      low_kes: Math.min(...lows),
      mid_kes: median(mids) ?? null,
      reports: items.length,
      role_title: items[0]?.role_title ?? null,
    });
  }

  return rows.sort((a, b) => Number(b.reports ?? 0) - Number(a.reports ?? 0));
}

export type PublicStoryRecord = Omit<StoryRecord, "status" | "moderation_note"> & {
  body: string | null;
  created_at: string | null;
  id: string | null;
  reasons: string[] | null;
  company_name: string | null;
  company_slug: string | null;
  comment_count: number | null;
  metoo: number | null;
  upvotes: number | null;
  would_work_again: boolean | null;
  author_username: string | null;
};

/** Map of user id -> claimed username, for showing authors on public stories. */
export async function readAuthorUsernames(): Promise<Map<string, string>> {
  const profiles = await readCollection<ProfileRecord>("profiles");
  return new Map(
    profiles
      .filter((profile) => Boolean(profile.username))
      .map((profile) => [profile.id, profile.username as string] as const),
  );
}



export async function getFilterOptionsData() {
  const companies = await readCollection<CompanyRecord>("companies");
  const industries = [
    ...new Set(companies.map((company) => company.industry).filter(Boolean)),
  ].sort() as string[];
  const counties = [
    ...new Set(companies.map((company) => company.county).filter(Boolean)),
  ].sort() as string[];
  return { companies, industries, counties };
}

export async function getPublicStories(input: {
  sort: "new" | "top" | "trending";
  industry?: string | null;
  county?: string | null;
  reason?: string | null;
  companySlug?: string | null;
  limit?: number;
}) {
  const [companies, stories, authorUsernames] = await Promise.all([
    readCollection<CompanyRecord>("companies"),
    readCollection<StoryRecord>("stories"),
    readAuthorUsernames(),
  ]);

  const companiesById = new Map(companies.map((company) => [company.id, company] as const));
  const publicStories = stories
    .filter((story) => story.status === "published")
    .filter((story) => (input.industry ? story.industry === input.industry : true))
    .filter((story) => (input.county ? story.county === input.county : true))
    .filter((story) => (input.companySlug ? story.company_slug === input.companySlug : true))
    .filter((story) => (input.reason ? (story.reasons ?? []).includes(input.reason) : true))
    .map<PublicStoryRecord>((story) => {
      const company = companiesById.get(story.company_id);
      return {
        ...story,
        body: story.body,
        created_at: story.created_at,
        id: story.id,
        company_name: story.company_name ?? company?.name ?? null,
        company_slug: story.company_slug ?? company?.slug ?? null,
        reasons: story.reasons ?? [],
        comment_count: story.comment_count,
        metoo: story.metoo,
        upvotes: story.upvotes,
        would_work_again: story.would_work_again,
        author_username: story.author_id ? (authorUsernames.get(story.author_id) ?? null) : null,
      };
    });

  const sorted = [...publicStories].sort((a, b) => {
    if (input.sort === "top") return Number(b.upvotes ?? 0) - Number(a.upvotes ?? 0);
    if (input.sort === "trending") {
      return Number(b.upvotes ?? 0) - Number(a.upvotes ?? 0);
    }
    return new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime();
  });

  const limit = input.limit ?? 20;
  return sorted.slice(0, limit);
}

export async function getCompanyView(slug: string) {
  const companies = await readCollection<CompanyRecord>("companies");
  const company = companies.find((entry) => entry.slug === slug) ?? null;
  if (!company) return null;

  const [scores, profile, stories, authorUsernames] = await Promise.all([
    buildCompanyScores(),
    readDocument<CompanyAIProfileRecord>("company_ai_profiles", company.id),
    readCollection<StoryRecord>("stories"),
    readAuthorUsernames(),
  ]);

  return {
    company,
    score: scores.find((entry) => entry.company_id === company.id) ?? null,
    profile,
    stories: stories
      .filter((story) => story.status === "published")
      .filter((story) => story.company_id === company.id)
      .map<PublicStoryRecord>((story) => ({
        ...story,
        body: story.body,
        created_at: story.created_at,
        id: story.id,
        company_name: story.company_name ?? company.name,
        company_slug: story.company_slug ?? company.slug,
        reasons: story.reasons ?? [],
        comment_count: story.comment_count,
        metoo: story.metoo,
        upvotes: story.upvotes,
        would_work_again: story.would_work_again,
        author_username: story.author_id ? (authorUsernames.get(story.author_id) ?? null) : null,
      })),
  };
}

export async function getStoryView(id: string) {
  const story = await readDocument<StoryRecord>("stories", id);
  if (!story || story.status !== "published") return null;

  const company =
    (story.company_id ? await readDocument<CompanyRecord>("companies", story.company_id) : null) ??
    null;
  const authorProfile = story.author_id
    ? await readDocument<ProfileRecord>("profiles", story.author_id)
    : null;
  const rawComments = (await readCollection<CommentRecord>("comments"))
    .filter((comment) => comment.status === "published")
    .filter((comment) => comment.story_id === id);

  const profiles = await readCollection<ProfileRecord>("profiles");
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile] as const));
  const verifications = await readCollection<{
    user_id?: string;
    id?: string;
    company_id?: string | null;
    badge_status?: string;
    account_type?: string;
  }>("account_verifications");
  const verificationByUser = new Map(
    verifications.map((entry) => [entry.user_id ?? entry.id ?? "", entry] as const),
  );

  const enriched: PublicComment[] = rawComments.map((comment) => {
    const profile = comment.author_id ? profilesById.get(comment.author_id) : null;
    const verification = comment.author_id ? verificationByUser.get(comment.author_id) : null;
    const official =
      comment.is_official ??
      Boolean(
        verification &&
          verification.account_type === "company" &&
          verification.company_id &&
          verification.company_id === story.company_id,
      );
    return {
      ...comment,
      author_username: comment.author_username ?? profile?.username ?? null,
      author_verified: comment.author_verified ?? verification?.badge_status === "claimed",
      is_official: official,
      likes: Number(comment.likes ?? 0),
      replies: [],
    };
  });

  const byId = new Map(enriched.map((comment) => [comment.id, comment] as const));
  const roots: PublicComment[] = [];
  for (const comment of enriched) {
    const parent = comment.parent_id ? byId.get(comment.parent_id) : null;
    if (parent) parent.replies.push(comment);
    else roots.push(comment);
  }

  // A thread containing an official reply anywhere floats to the top.
  const officialInThread = new Map<string, boolean>();
  const markOfficial = (comment: PublicComment): boolean => {
    const childHas = comment.replies.map(markOfficial).some(Boolean);
    const has = comment.is_official || childHas;
    officialInThread.set(comment.id, has);
    return has;
  };
  for (const root of roots) markOfficial(root);

  const score = (comment: PublicComment): number =>
    (officialInThread.get(comment.id) ? 1_000_000 : 0) +
    comment.likes * 3 +
    comment.replies.length * 2;
  const sortTree = (list: PublicComment[]) => {
    list.sort((a, b) => {
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    for (const item of list) sortTree(item.replies);
  };
  sortTree(roots);

  return {
    story: {
      ...story,
      company_name: story.company_name ?? company?.name ?? null,
      company_slug: story.company_slug ?? company?.slug ?? null,
      reasons: story.reasons ?? [],
      comment_count: story.comment_count,
      metoo: story.metoo,
      upvotes: story.upvotes,
      would_work_again: story.would_work_again,
      author_username: authorProfile?.username ?? null,
    } as PublicStoryRecord,
    comments: roots,
    commentTotal: enriched.length,
  };
}

export async function searchData(queryText: string) {
  const q = queryText.trim().toLowerCase();
  if (q.length < 2) return { companies: [], stories: [] };

  const [companies, stories, authorUsernames] = await Promise.all([
    readCollection<CompanyRecord>("companies"),
    readCollection<StoryRecord>("stories"),
    readAuthorUsernames(),
  ]);

  const companyMatches = companies
    .filter((company) =>
      [company.name, company.industry ?? "", company.county ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
    .slice(0, 10);

  const storyMatches = stories
    .filter((story) => story.status === "published")
    .filter((story) =>
      [story.title, story.body, story.company_name ?? "", story.industry ?? "", story.county ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
    .slice(0, 15)
    .map<PublicStoryRecord>((story) => ({
      ...story,
      body: story.body,
      created_at: story.created_at,
      id: story.id,
      company_name:
        story.company_name ??
        companies.find((company) => company.id === story.company_id)?.name ??
        null,
      company_slug:
        story.company_slug ??
        companies.find((company) => company.id === story.company_id)?.slug ??
        null,
      reasons: story.reasons ?? [],
      comment_count: story.comment_count,
      metoo: story.metoo,
      upvotes: story.upvotes,
      would_work_again: story.would_work_again,
      author_username: story.author_id ? (authorUsernames.get(story.author_id) ?? null) : null,
    }));

  return { companies: companyMatches, stories: storyMatches };
}
