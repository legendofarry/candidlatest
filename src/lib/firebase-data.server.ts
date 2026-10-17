const randomUUID = () => crypto.randomUUID();
import type {
  DocumentData,
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from "./firestore-rest.server";
import { getFirestoreDb } from "./firebase.server";
import { getEffectiveMembershipTier, type MembershipSource } from "./membership";
import { allKenyaAreas, areasForCounty } from "./kenya-locations";
import { cacheServerRead } from "./server-cache";
import { isValidMapCoordinates } from "./map-location";

export type CompanyRecord = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  county: string | null;
  area?: string | null;
  website?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  map_url?: string | null;
  verified: boolean;
  /** New employers remain private until a public story is approved or an owner lists them. */
  is_public?: boolean;
  created_at: string;
  aliases?: string[];
  claimed_by?: string | null;
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
  display_name?: string | null;
  photo_url?: string | null;
  cover_url?: string | null;
  verified?: boolean;
  username_changed_at?: string | null;
  socials?: ProfileSocials | null;
  account_type?: "individual" | "company" | "official" | "unknown";
  onboarded_at?: string | null;
  subscription_tier?: "basic" | "premium" | "gold";
  subscription_status?: "active" | "cancelled" | "expired" | "past_due";
  subscription_provider?: string | null;
  subscription_started_at?: string | null;
  subscription_period_ends_at?: string | null;
  subscription_switch_unlocked?: boolean;
  subscription_source?: MembershipSource;
  subscription_assigned_by?: string | null;
  subscription_assigned_at?: string | null;
  subscription_changed_at?: string | null;
  subscription_change_id?: string | null;
  subscription_version?: number;
  investigation_hold?:
    boolean | { active?: boolean; started_at?: string | null; updated_at?: string | null } | null;
};

function membershipBadgeTier(profile: ProfileRecord | undefined): "basic" | "premium" | "gold" {
  return getEffectiveMembershipTier(profile);
}

export type StoryRecord = {
  id: string;
  company_id: string;
  company_name: string | null;
  company_slug: string | null;
  company_verified?: boolean;
  title: string;
  body: string;
  reasons: string[];
  role_level: string | null;
  position?: string | null;
  county: string | null;
  area?: string | null;
  /** Employer stays linked internally while the public story can hide its identity. */
  company_public?: boolean;
  company_location_suggestion?: string | null;
  workplace_lat?: number | null;
  workplace_lng?: number | null;
  tenure: string | null;
  industry: string | null;
  would_work_again: boolean | null;
  author_id: string | null;
  author_username?: string | null;
  author_photo_url?: string | null;
  author_membership_tier?: "basic" | "premium" | "gold";
  verified?: boolean;
  status: "published" | "pending" | "hidden";
  moderation_note: string | null;
  evidence_status?: "pending_review" | "reviewed" | null;
  upvotes: number;
  likes?: number;
  follower_count?: number;
  metoo: number;
  comment_count: number;
  comment_count_scope?: "top_level_v1";
  created_at: string;
  post_type?: "workplace_story" | "announcement";
  media?: CommunityPostMedia[];
};

export type CommunityPostMedia = {
  url: string;
  resource_type: "image" | "video";
  format: string;
  width?: number | null;
  height?: number | null;
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
  author_photo_url?: string | null;
  author_verified?: boolean;
  author_membership_tier?: "basic" | "premium" | "gold";
  is_official?: boolean;
  likes?: number;
  is_deleted?: boolean;
  counter_adjusted_on_delete?: boolean;
  edited_at?: string;
  created_at: string;
};

export type PublicComment = CommentRecord & {
  author_username: string | null;
  author_photo_url: string | null;
  author_membership_tier: "basic" | "premium" | "gold";
  author_verified: boolean;
  is_official: boolean;
  likes: number;
  replies: PublicComment[];
};

/** Remove deleted comments from public threads while keeping any surviving replies reachable. */
function omitDeletedCommentNodes(roots: PublicComment[]): PublicComment[] {
  const visibleRoots: PublicComment[] = [];
  const visit = (comment: PublicComment, visibleParent: PublicComment | null) => {
    if (comment.is_deleted) {
      for (const reply of comment.replies) visit(reply, visibleParent);
      return;
    }

    const visibleComment = { ...comment, replies: [] as PublicComment[] };
    if (visibleParent) visibleParent.replies.push(visibleComment);
    else visibleRoots.push(visibleComment);
    for (const reply of comment.replies) visit(reply, visibleComment);
  };

  for (const root of roots) visit(root, null);
  return visibleRoots;
}

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
  verified: boolean;
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

function publicWorkplaceCoordinates(story: StoryRecord) {
  const saved = isValidMapCoordinates({
    lat: Number(story.workplace_lat),
    lng: Number(story.workplace_lng),
  })
    ? { lat: Number(story.workplace_lat), lng: Number(story.workplace_lng) }
    : null;
  return { workplace_lat: saved?.lat ?? null, workplace_lng: saved?.lng ?? null };
}

function publicStoryFields(
  story: StoryRecord,
): Omit<
  StoryRecord,
  | "status"
  | "moderation_note"
  | "evidence_status"
  | "company_public"
  | "company_location_suggestion"
> {
  return {
    id: story.id,
    company_id: story.company_id,
    company_name: story.company_name,
    company_slug: story.company_slug,
    company_verified: Boolean(story.company_verified),
    title: story.title,
    body: story.body,
    reasons: story.reasons,
    role_level: story.role_level,
    position: story.position ?? null,
    county: story.county,
    area: story.area ?? null,
    workplace_lat: story.workplace_lat ?? null,
    workplace_lng: story.workplace_lng ?? null,
    tenure: story.tenure,
    industry: story.industry,
    would_work_again: story.would_work_again,
    author_id: story.author_id,
    author_username: story.author_username ?? null,
    author_photo_url: story.author_photo_url ?? null,
    author_membership_tier: story.author_membership_tier ?? "basic",
    verified: Boolean(story.verified),
    upvotes: story.upvotes,
    likes: Number(story.likes ?? 0),
    follower_count: Number(story.follower_count ?? 0),
    metoo: story.metoo,
    comment_count: story.comment_count,
    created_at: story.created_at,
    post_type: story.post_type ?? "workplace_story",
    media: story.media ?? [],
  };
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

/** Returns and lazily repairs the stored count of visible, top-level comments. */
export async function getTopLevelCommentCount(
  story: StoryRecord,
  updateTime?: string,
): Promise<number> {
  if (story.comment_count_scope === "top_level_v1") {
    return Math.max(0, Number(story.comment_count ?? 0));
  }

  const db = getFirestoreDb();
  const roots = db
    .collection("comments")
    .where("story_id", "==", story.id)
    .where("status", "==", "published")
    .where("parent_id", "==", null);
  const [publishedRoots, deletedRoots] = await Promise.all([
    roots.count(),
    roots.where("is_deleted", "==", true).count(),
  ]);
  const count = Math.max(0, publishedRoots - deletedRoots);

  // Repair legacy reply-inclusive counters once. The update-time precondition
  // prevents this backfill from overwriting a comment added/deleted meanwhile.
  if (updateTime) {
    try {
      await db
        .collection("stories")
        .doc(story.id)
        .update({ comment_count: count, comment_count_scope: "top_level_v1" }, { updateTime });
      story.comment_count = count;
      story.comment_count_scope = "top_level_v1";
      return count;
    } catch {
      const latest = await db.collection("stories").doc(story.id).get();
      const current = latest.data() as StoryRecord | undefined;
      if (current?.comment_count_scope === "top_level_v1") {
        story.comment_count = Math.max(0, Number(current.comment_count ?? 0));
        story.comment_count_scope = "top_level_v1";
        return story.comment_count;
      }
    }
  }

  story.comment_count = count;
  return count;
}

export async function queryFirst<T extends DocumentData>(
  name: string,
  field: string,
  value: string | boolean,
) {
  const db = getFirestoreDb();
  const snapshot = await db.collection(name).where(field, "==", value).limit(1).get();
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

function isPublicCompany(company: CompanyRecord) {
  return company.is_public !== false && !isPlaceholderCompanyName(company.name);
}

function isPlaceholderCompanyName(name: string | null | undefined) {
  return /^(n\/?a|none|unknown|not applicable|confidential)$/i.test(name?.trim() ?? "");
}

function isDiscoverableCompany(company: CompanyRecord, publishedCompanyIds: ReadonlySet<string>) {
  return (
    !isPlaceholderCompanyName(company.name) &&
    (isPublicCompany(company) || publishedCompanyIds.has(company.id))
  );
}

async function calculateCompanyScores() {
  const db = getFirestoreDb();
  const [companies, stories, ratings, profiles] = await Promise.all([
    db
      .collection("companies")
      .limit(1000)
      .get()
      .then((snapshot) => snapshot.docs.map((doc) => toRecord<CompanyRecord>(doc))),
    db
      .collection("stories")
      .where("status", "==", "published")
      .orderBy("created_at", "desc")
      .limit(1000)
      .get()
      .then((snapshot) => snapshot.docs.map((doc) => toRecord<StoryRecord>(doc))),
    db
      .collection("company_ratings")
      .orderBy("created_at", "desc")
      .limit(1000)
      .get()
      .then((snapshot) => snapshot.docs.map((doc) => toRecord<CompanyRatingRecord>(doc))),
    db
      .collection("company_ai_profiles")
      .limit(1000)
      .get()
      .then((snapshot) => snapshot.docs.map((doc) => toRecord<CompanyAIProfileRecord>(doc))),
  ]);

  const storiesByCompany = new Map<string, StoryRecord[]>();
  for (const story of stories) {
    if (!story.company_id || story.status !== "published") continue;
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
  const publishedCompanyIds = new Set(storiesByCompany.keys());

  // A published story is itself a public reference to its employer. This also
  // repairs older approval flows that published the story without flipping the
  // company's is_public flag.
  return companies
    .filter((company) => isDiscoverableCompany(company, publishedCompanyIds))
    .map<CompanyScoreRecord>((company) => {
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
        verified: Boolean(company.verified),
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

export function buildCompanyScores() {
  return cacheServerRead("public:company-scores", 60_000, calculateCompanyScores);
}

async function calculateSalaryAggregates() {
  const reports = (
    await getFirestoreDb()
      .collection("salary_reports")
      .orderBy("created_at", "desc")
      .limit(1000)
      .get()
  ).docs.map((doc) => toRecord<SalaryReportRecord>(doc));
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

export function buildSalaryAggregates() {
  return cacheServerRead("public:salary-aggregates", 60_000, calculateSalaryAggregates);
}

/** A typical range is only shown once this many people have contributed. */
export const SALARY_MIN_CONTRIBUTIONS = 3;

export type CompanySalarySummary = {
  company_id: string;
  name: string;
  slug: string;
  verified: boolean;
  industry: string | null;
  county: string | null;
  contributions: number;
  positions: number;
  average_kes: number | null;
};

export type CompanyPositionSalary = {
  role_title: string;
  contributions: number;
  average_kes: number;
  low_kes: number;
  high_kes: number;
  range_visible: boolean;
};

function midpoint(report: SalaryReportRecord) {
  return (Number(report.min_kes) + Number(report.max_kes)) / 2;
}

/** Company-first salary listing for the directory screen. */
async function calculateCompanySalaryDirectory() {
  const db = getFirestoreDb();
  const [companies, reports, stories] = await Promise.all([
    db
      .collection("companies")
      .limit(1000)
      .get()
      .then((snapshot) => snapshot.docs.map((doc) => toRecord<CompanyRecord>(doc))),
    db
      .collection("salary_reports")
      .orderBy("created_at", "desc")
      .limit(1000)
      .get()
      .then((snapshot) => snapshot.docs.map((doc) => toRecord<SalaryReportRecord>(doc))),
    db
      .collection("stories")
      .where("status", "==", "published")
      .orderBy("created_at", "desc")
      .limit(1000)
      .get()
      .then((snapshot) => snapshot.docs.map((doc) => toRecord<StoryRecord>(doc))),
  ]);

  const companiesWithPublishedStories = new Set(
    stories
      .filter((story) => story.status === "published" && story.company_id)
      .map((story) => story.company_id),
  );

  const byCompany = new Map<string, SalaryReportRecord[]>();
  for (const report of reports) {
    if (!report.company_id) continue;
    const list = byCompany.get(report.company_id) ?? [];
    list.push(report);
    byCompany.set(report.company_id, list);
  }

  const rows: CompanySalarySummary[] = [];
  for (const company of companies.filter((entry) =>
    isDiscoverableCompany(entry, companiesWithPublishedStories),
  )) {
    const items = byCompany.get(company.id) ?? [];
    if (items.length === 0) continue;
    const positions = new Set(items.map((item) => item.role_title.trim().toLowerCase()));
    rows.push({
      company_id: company.id,
      name: company.name,
      slug: company.slug,
      verified: Boolean(company.verified),
      industry: company.industry,
      county: company.county,
      contributions: items.length,
      positions: positions.size,
      average_kes:
        items.length >= SALARY_MIN_CONTRIBUTIONS
          ? Math.round(average(items.map(midpoint)) ?? 0)
          : null,
    });
  }

  return rows.sort((a, b) => b.contributions - a.contributions);
}

export function buildCompanySalaryDirectory() {
  return cacheServerRead("public:salary-directory", 60_000, calculateCompanySalaryDirectory);
}

/** Per-position breakdown for one company. */
async function calculateCompanySalaryDetail(slug: string) {
  const db = getFirestoreDb();
  const companySnapshot = await db.collection("companies").where("slug", "==", slug).limit(1).get();
  const company = companySnapshot.docs[0] ? toRecord<CompanyRecord>(companySnapshot.docs[0]) : null;
  const hasPublishedStory = Boolean(
    company &&
    (
      await db
        .collection("stories")
        .where("company_id", "==", company.id)
        .where("status", "==", "published")
        .limit(1)
        .get()
    ).size,
  );
  if (company && isPlaceholderCompanyName(company.name)) return null;
  if (company && !isPublicCompany(company) && !hasPublishedStory) return null;
  if (!company) return null;

  const reports = (
    await db.collection("salary_reports").where("company_id", "==", company.id).limit(1000).get()
  ).docs.map((doc) => toRecord<SalaryReportRecord>(doc));

  const groups = new Map<string, SalaryReportRecord[]>();
  for (const report of reports) {
    const key = report.role_title.trim().toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(report);
    groups.set(key, list);
  }

  const positions: CompanyPositionSalary[] = [...groups.values()].map((items) => {
    const visible = items.length >= SALARY_MIN_CONTRIBUTIONS;
    return {
      role_title: items[0]?.role_title ?? "—",
      contributions: items.length,
      average_kes: Math.round(average(items.map(midpoint)) ?? 0),
      low_kes: Math.min(...items.map((item) => Number(item.min_kes))),
      high_kes: Math.max(...items.map((item) => Number(item.max_kes))),
      range_visible: visible,
    };
  });

  return {
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      verified: Boolean(company.verified),
      industry: company.industry,
      county: company.county,
    },
    contributions: await db
      .collection("salary_reports")
      .where("company_id", "==", company.id)
      .count(),
    minimum: SALARY_MIN_CONTRIBUTIONS,
    positions: positions.sort((a, b) => b.contributions - a.contributions),
  };
}

export function buildCompanySalaryDetail(slug: string) {
  return cacheServerRead(`public:salary-detail:${slug}`, 60_000, () =>
    calculateCompanySalaryDetail(slug),
  );
}

export type PublicStoryRecord = Omit<
  StoryRecord,
  | "status"
  | "moderation_note"
  | "evidence_status"
  | "company_public"
  | "body"
  | "created_at"
  | "id"
  | "company_id"
  | "reasons"
  | "company_name"
  | "company_slug"
  | "company_verified"
  | "comment_count"
  | "metoo"
  | "upvotes"
  | "likes"
  | "would_work_again"
  | "author_username"
  | "author_membership_tier"
  | "area"
  | "company_location_suggestion"
> & {
  body: string | null;
  created_at: string | null;
  id: string | null;
  company_id: string | null;
  reasons: string[] | null;
  company_name: string | null;
  company_slug: string | null;
  company_verified: boolean;
  comment_count: number | null;
  metoo: number | null;
  upvotes: number | null;
  likes: number | null;
  follower_count: number;
  would_work_again: boolean | null;
  author_username: string | null;
  author_membership_tier: "basic" | "premium" | "gold";
  area: string | null;
  company_location_suggestion?: null;
};

async function calculateFilterOptionsData() {
  const db = getFirestoreDb();
  const [companySnapshot, storySnapshot] = await Promise.all([
    db.collection("companies").orderBy("created_at", "desc").limit(500).get(),
    db
      .collection("stories")
      .where("status", "==", "published")
      .orderBy("created_at", "desc")
      .limit(500)
      .get(),
  ]);
  const allCompanies = companySnapshot.docs.map((doc) => toRecord<CompanyRecord>(doc));
  const stories = storySnapshot.docs.map((doc) => toRecord<StoryRecord>(doc));
  const companiesWithPublishedStories = new Set(
    stories
      .filter((story) => story.status === "published" && story.company_id)
      .map((story) => story.company_id),
  );
  const companies = allCompanies.filter((company) =>
    isDiscoverableCompany(company, companiesWithPublishedStories),
  );
  const industries = [
    ...new Set(companies.map((company) => company.industry).filter(Boolean)),
  ].sort() as string[];
  const counties = [
    "Baringo",
    "Bomet",
    "Bungoma",
    "Busia",
    "Elgeyo-Marakwet",
    "Embu",
    "Garissa",
    "Homa Bay",
    "Isiolo",
    "Kajiado",
    "Kakamega",
    "Kericho",
    "Kiambu",
    "Kilifi",
    "Kirinyaga",
    "Kisii",
    "Kisumu",
    "Kitui",
    "Kwale",
    "Laikipia",
    "Lamu",
    "Machakos",
    "Makueni",
    "Mandera",
    "Marsabit",
    "Meru",
    "Migori",
    "Mombasa",
    "Murang’a",
    "Nairobi",
    "Nakuru",
    "Nandi",
    "Narok",
    "Nyamira",
    "Nyandarua",
    "Nyeri",
    "Samburu",
    "Siaya",
    "Taita-Taveta",
    "Tana River",
    "Tharaka-Nithi",
    "Trans Nzoia",
    "Turkana",
    "Uasin Gishu",
    "Vihiga",
    "Wajir",
    "West Pokot",
  ];
  const publishedStories = stories.filter((story) => story.status === "published");
  const areasByCounty = Object.fromEntries(
    counties.map((county) => {
      const customAreas = publishedStories
        .filter((story) => normalizeCountyFilter(story.county) === normalizeCountyFilter(county))
        .map((story) => story.area?.trim())
        .filter((area): area is string => Boolean(area));
      const byNormalizedArea = new Map<string, string>();
      for (const area of [...(areasForCounty(county) ?? []), ...customAreas]) {
        const cleaned = area.trim().replace(/\s+/g, " ");
        if (cleaned && !byNormalizedArea.has(cleaned.toLocaleLowerCase())) {
          byNormalizedArea.set(cleaned.toLocaleLowerCase(), cleaned);
        }
      }
      return [county, [...byNormalizedArea.values()].sort((a, b) => a.localeCompare(b))];
    }),
  ) as Record<string, string[]>;
  const areaLabels = new Map<string, string>();
  for (const area of [
    ...allKenyaAreas(),
    ...publishedStories
      .map((story) => story.area?.trim())
      .filter((area): area is string => Boolean(area)),
  ]) {
    const cleaned = area.trim().replace(/\s+/g, " ");
    if (cleaned && !areaLabels.has(cleaned.toLocaleLowerCase())) {
      areaLabels.set(cleaned.toLocaleLowerCase(), cleaned);
    }
  }
  const areas = [...areaLabels.values()].sort((a, b) => a.localeCompare(b));
  return { companies, industries, counties, areas, areasByCounty };
}

export function getFilterOptionsData() {
  return cacheServerRead("public:filter-options", 300_000, calculateFilterOptionsData);
}

function normalizeCountyFilter(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+(city\s+)?county$/i, "");
}

async function calculatePublicStories(input: {
  sort: "new" | "top" | "trending";
  industry?: string | null;
  county?: string | null;
  area?: string | null;
  reason?: string | null;
  companySlug?: string | null;
  limit?: number;
}) {
  const db = getFirestoreDb();
  const sortField = input.sort === "new" ? "created_at" : "upvotes";
  const storySnapshot = await db
    .collection("stories")
    .where("status", "==", "published")
    .orderBy(sortField, "desc")
    .limit(500)
    .get();
  const candidates = storySnapshot.docs
    .map((doc) => ({ story: toRecord<StoryRecord>(doc), updateTime: doc.updateTime }))
    .filter(({ story }) => story.status === "published")
    .filter(({ story }) => (input.industry ? story.industry === input.industry : true))
    .filter(({ story }) =>
      input.county
        ? normalizeCountyFilter(story.county) === normalizeCountyFilter(input.county)
        : true,
    )
    .filter(({ story }) =>
      input.area
        ? (story.area ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase() ===
          input.area.trim().replace(/\s+/g, " ").toLocaleLowerCase()
        : true,
    )
    .filter(({ story }) => (input.companySlug ? story.company_slug === input.companySlug : true))
    .filter(({ story }) => (input.reason ? (story.reasons ?? []).includes(input.reason) : true))
    .sort(({ story: a }, { story: b }) =>
      input.sort === "new"
        ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : Number(b.upvotes ?? 0) - Number(a.upvotes ?? 0),
    );
  const limit = input.limit ?? 20;
  const selected = limit <= 0 ? candidates : candidates.slice(0, limit);
  await Promise.all(
    selected.map(({ story, updateTime }) => getTopLevelCommentCount(story, updateTime)),
  );
  return selected.map(({ story }) => ({
    ...publicStoryFields(story),
    title: story.title,
    body: story.body,
    ...publicWorkplaceCoordinates(story),
    company_location_suggestion: null,
    created_at: story.created_at,
    id: story.id,
    company_id: story.company_id,
    company_name: story.company_name ?? null,
    company_slug: story.company_slug ?? null,
    company_verified: Boolean(story.company_verified),
    area: story.area ?? null,
    likes: Number(story.likes ?? 0),
    follower_count: Number(story.follower_count ?? 0),
    reasons: story.reasons ?? [],
    comment_count: Number(story.comment_count ?? 0),
    metoo: story.metoo,
    upvotes: story.upvotes,
    would_work_again: story.would_work_again,
    author_username: story.author_username ?? null,
    author_membership_tier: story.author_membership_tier ?? "basic",
  }));
}

export function getPublicStories(input: {
  sort: "new" | "top" | "trending";
  industry?: string | null;
  county?: string | null;
  area?: string | null;
  reason?: string | null;
  companySlug?: string | null;
  limit?: number;
}) {
  const cacheKey = `public:stories:${JSON.stringify(input)}`;
  return cacheServerRead(cacheKey, 30_000, () => calculatePublicStories(input));
}

/** Cursor page used by the unfiltered chronological feed. */
export async function getPublicStoryPage(input: {
  limit: number;
  cursor?: { createdAt: string; id: string } | null;
  industry?: string | null;
  county?: string | null;
  area?: string | null;
}) {
  const db = getFirestoreDb();
  let baseQuery = db
    .collection("stories")
    .where("status", "==", "published")
    .orderBy("created_at", "desc")
    .orderBy("__name__", "desc");
  if (input.industry) baseQuery = baseQuery.where("industry", "==", input.industry);
  if (input.county) baseQuery = baseQuery.where("county", "==", input.county);
  if (input.area) baseQuery = baseQuery.where("area", "==", input.area);
  let cursor = input.cursor ?? null;
  const pageRows: Array<{ story: StoryRecord; updateTime: string | undefined }> = [];
  let exhausted = false;
  // The query filters and cursor keep reads bounded to matching published stories.
  while (pageRows.length <= input.limit && !exhausted) {
    let query = baseQuery;
    if (cursor) {
      query = query.startAfter(cursor.createdAt, db.collection("stories").doc(cursor.id));
    }
    const snapshot = await query.limit(input.limit + 1).get();
    const chunk = snapshot.docs.map((doc) => ({
      story: toRecord<StoryRecord>(doc),
      updateTime: doc.updateTime,
    }));
    pageRows.push(...chunk);
    const lastDocument = snapshot.docs.at(-1);
    exhausted = snapshot.size < input.limit + 1 || !lastDocument;
    if (lastDocument) {
      const lastStory = toRecord<StoryRecord>(lastDocument);
      cursor = { createdAt: lastStory.created_at, id: lastStory.id };
    }
  }
  const hasMore = pageRows.length > input.limit;
  const storyRows = pageRows.slice(0, input.limit);
  const stories = storyRows.map(({ story }) => story);
  await Promise.all(
    storyRows.map(({ story, updateTime }) => getTopLevelCommentCount(story, updateTime)),
  );
  const [companies, authors] = await Promise.all([
    Promise.all(
      [...new Set(stories.map((story) => story.company_id).filter(Boolean))].map((id) =>
        readDocument<CompanyRecord>("companies", id),
      ),
    ),
    Promise.all(
      [
        ...new Set(
          stories.map((story) => story.author_id).filter((id): id is string => Boolean(id)),
        ),
      ].map((id) => readDocument<ProfileRecord>("profiles", id)),
    ),
  ]);
  const companiesById = new Map(
    companies.filter(Boolean).map((company) => [company!.id, company!]),
  );
  const authorsById = new Map(authors.filter(Boolean).map((profile) => [profile!.id, profile!]));
  const publicStories = stories.map<PublicStoryRecord>((story) => {
    const company = companiesById.get(story.company_id);
    const author = story.author_id ? authorsById.get(story.author_id) : null;
    return {
      ...publicStoryFields(story),
      ...publicWorkplaceCoordinates(story),
      company_location_suggestion: null,
      company_name: company?.name ?? story.company_name ?? null,
      company_slug: story.company_slug ?? company?.slug ?? null,
      company_verified: Boolean(company?.verified),
      area: story.area ?? null,
      likes: Number(story.likes ?? 0),
      follower_count: Number(story.follower_count ?? 0),
      reasons: story.reasons ?? [],
      comment_count: Number(story.comment_count ?? 0),
      metoo: Number(story.metoo ?? 0),
      upvotes: Number(story.upvotes ?? 0),
      author_username: story.author_username ?? author?.username ?? null,
      author_membership_tier: membershipBadgeTier(author ?? undefined),
    };
  });
  const last = stories.at(-1);
  return {
    stories: publicStories,
    hasMore,
    nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

async function calculateCompanyView(slug: string) {
  const db = getFirestoreDb();
  const companySnapshot = await db.collection("companies").where("slug", "==", slug).limit(1).get();
  const company = companySnapshot.docs[0] ? toRecord<CompanyRecord>(companySnapshot.docs[0]) : null;
  if (!company) return null;

  const [storiesSnapshot, scores, profile] = await Promise.all([
    db
      .collection("stories")
      .where("company_id", "==", company.id)
      .where("status", "==", "published")
      .orderBy("created_at", "desc")
      .limit(51)
      .get(),
    buildCompanyScores(),
    readDocument<CompanyAIProfileRecord>("company_ai_profiles", company.id),
  ]);
  const storyDocs = storiesSnapshot.docs.slice(0, 50);
  const stories = storyDocs.map((doc) => toRecord<StoryRecord>(doc));
  await Promise.all(
    storyDocs.map((doc, index) => getTopLevelCommentCount(stories[index]!, doc.updateTime)),
  );
  if (!isPublicCompany(company) && stories.length === 0) return null;

  return {
    company,
    score: scores.find((entry) => entry.company_id === company.id) ?? null,
    profile,
    stories: stories.map<PublicStoryRecord>((story) => ({
      ...publicStoryFields(story),
      body: story.body,
      created_at: story.created_at,
      id: story.id,
      ...publicWorkplaceCoordinates(story),
      company_location_suggestion: null,
      company_name: company.name,
      company_slug: company.slug,
      company_verified: Boolean(company.verified),
      area: story.area ?? null,
      reasons: story.reasons ?? [],
      comment_count: story.comment_count,
      likes: Number(story.likes ?? 0),
      follower_count: Number(story.follower_count ?? 0),
      metoo: story.metoo,
      upvotes: story.upvotes,
      would_work_again: story.would_work_again,
      author_username: story.author_username ?? null,
      author_membership_tier: story.author_membership_tier ?? "basic",
    })),
    hasMoreStories: storiesSnapshot.size > 50,
  };
}

export function getCompanyView(slug: string) {
  return cacheServerRead(`public:company:${slug}`, 30_000, () => calculateCompanyView(slug));
}

async function calculateStoryView(id: string) {
  const storySnapshot = await getFirestoreDb().collection("stories").doc(id).get();
  const story = storySnapshot.exists
    ? ({ ...(storySnapshot.data() as StoryRecord), id } as StoryRecord)
    : null;
  if (!story || story.status !== "published") return null;

  const [company, authorProfile, commentSnapshot, commentTotal] = await Promise.all([
    story.company_id ? readDocument<CompanyRecord>("companies", story.company_id) : null,
    story.author_id ? readDocument<ProfileRecord>("profiles", story.author_id) : null,
    getFirestoreDb()
      .collection("comments")
      .where("story_id", "==", id)
      .where("status", "==", "published")
      .orderBy("created_at", "desc")
      .orderBy("__name__", "desc")
      .limit(51)
      .get(),
    getTopLevelCommentCount(story, storySnapshot.updateTime),
  ]);
  const commentRows = commentSnapshot.docs.slice(0, 50);
  const rawComments = commentRows
    .map((doc) => doc.data() as CommentRecord)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const authorIds = [
    ...new Set(
      rawComments
        .filter(
          (comment) =>
            comment.author_id &&
            (!comment.author_username ||
              !comment.author_photo_url ||
              !comment.author_membership_tier),
        )
        .map((comment) => comment.author_id as string),
    ),
  ];
  const profiles = await Promise.all(
    authorIds.map((authorId) => readDocument<ProfileRecord>("profiles", authorId)),
  );
  const profilesById = new Map(
    profiles.filter((profile) => profile).map((profile) => [profile!.id, profile!] as const),
  );

  const enriched: PublicComment[] = rawComments.map((comment) => {
    const profile = comment.author_id ? profilesById.get(comment.author_id) : null;
    const official = comment.author_id === "candid-official" || (comment.is_official ?? false);
    return {
      ...comment,
      body: comment.is_deleted ? "" : comment.body,
      author_username: comment.author_username ?? profile?.username ?? null,
      author_photo_url: comment.author_photo_url ?? profile?.photo_url ?? null,
      author_membership_tier: membershipBadgeTier(profile ?? undefined),
      author_verified: Boolean(comment.author_verified),
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
  const visibleRoots = omitDeletedCommentNodes(roots);

  // A thread containing an official reply anywhere floats to the top.
  const officialInThread = new Map<string, boolean>();
  const markOfficial = (comment: PublicComment): boolean => {
    const childHas = comment.replies.map(markOfficial).some(Boolean);
    const has = comment.is_official || childHas;
    officialInThread.set(comment.id, has);
    return has;
  };
  for (const root of visibleRoots) markOfficial(root);

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
  sortTree(visibleRoots);
  return {
    story: {
      ...publicStoryFields(story),
      title: story.title,
      body: story.body,
      ...publicWorkplaceCoordinates(story),
      company_location_suggestion: null,
      company_id: story.company_id,
      company_name: company?.name ?? story.company_name ?? null,
      company_slug: story.company_slug ?? company?.slug ?? null,
      company_verified: Boolean(company?.verified),
      area: story.area ?? null,
      likes: Number(story.likes ?? 0),
      follower_count: Number(story.follower_count ?? 0),
      reasons: story.reasons ?? [],
      comment_count: commentTotal,
      metoo: story.metoo,
      upvotes: story.upvotes,
      would_work_again: story.would_work_again,
      author_username: authorProfile?.username ?? null,
      author_membership_tier: membershipBadgeTier(authorProfile ?? undefined),
    } as PublicStoryRecord,
    comments: visibleRoots,
    commentTotal,
    commentsHasMore: commentSnapshot.size > 50,
    commentsCursor:
      commentSnapshot.size > 50 && commentRows.at(-1)
        ? {
            createdAt: String(commentRows.at(-1)!.get("created_at") ?? ""),
            id: commentRows.at(-1)!.id,
          }
        : null,
  };
}

export function getStoryView(id: string) {
  return calculateStoryView(id);
}

export async function getStoryCommentsPage(
  storyId: string,
  cursor: { createdAt: string; id: string } | null,
) {
  const db = getFirestoreDb();
  const story = await readDocument<StoryRecord>("stories", storyId);
  if (!story || story.status !== "published")
    return { comments: [], hasMore: false, nextCursor: null };

  let query = db
    .collection("comments")
    .where("story_id", "==", storyId)
    .where("status", "==", "published")
    .orderBy("created_at", "desc")
    .orderBy("__name__", "desc");
  if (cursor) {
    query = query.startAfter(cursor.createdAt, db.collection("comments").doc(cursor.id));
  }
  const snapshot = await query.limit(51).get();
  const rows = snapshot.docs.slice(0, 50);
  const raw = rows.map((doc) => ({ ...(doc.data() as CommentRecord), id: doc.id }));
  const authorIds = [
    ...new Set(
      raw
        .filter(
          (comment) =>
            comment.author_id &&
            (!comment.author_username ||
              !comment.author_photo_url ||
              !comment.author_membership_tier),
        )
        .map((comment) => comment.author_id as string),
    ),
  ];
  const profiles = await Promise.all(
    authorIds.map((authorId) => readDocument<ProfileRecord>("profiles", authorId)),
  );
  const profilesById = new Map(
    profiles.filter((profile) => profile).map((profile) => [profile!.id, profile!] as const),
  );
  const comments: PublicComment[] = raw.map((comment) => {
    const profile = comment.author_id ? profilesById.get(comment.author_id) : null;
    return {
      ...comment,
      body: comment.is_deleted ? "" : comment.body,
      author_username: comment.author_username ?? profile?.username ?? null,
      author_photo_url: comment.author_photo_url ?? profile?.photo_url ?? null,
      author_membership_tier:
        comment.author_membership_tier ?? membershipBadgeTier(profile ?? undefined),
      author_verified: Boolean(comment.author_verified),
      is_official: comment.author_id === "candid-official" || Boolean(comment.is_official),
      likes: Number(comment.likes ?? 0),
      replies: [],
    };
  });
  const byId = new Map(comments.map((comment) => [comment.id, comment] as const));
  const roots: PublicComment[] = [];
  for (const comment of comments) {
    const parent = comment.parent_id ? byId.get(comment.parent_id) : null;
    if (parent) parent.replies.push(comment);
    else roots.push(comment);
  }
  const visibleRoots = omitDeletedCommentNodes(roots);
  const last = rows.at(-1);
  const hasMore = snapshot.size > 50;
  return {
    comments: visibleRoots,
    hasMore,
    nextCursor:
      hasMore && last ? { createdAt: String(last.get("created_at") ?? ""), id: last.id } : null,
  };
}

/** Loads the ancestor chain for a notification-linked comment outside the newest page. */
export async function getStoryCommentContext(storyId: string, commentId: string) {
  const db = getFirestoreDb();
  const story = await readDocument<StoryRecord>("stories", storyId);
  if (!story || story.status !== "published") return null;

  const chain: CommentRecord[] = [];
  const visited = new Set<string>();
  let currentId: string | null = commentId;
  for (let depth = 0; currentId && depth < 20 && !visited.has(currentId); depth += 1) {
    visited.add(currentId);
    const snapshot: DocumentSnapshot = await db.collection("comments").doc(currentId).get();
    if (!snapshot.exists) break;
    const comment: CommentRecord = { ...(snapshot.data() as CommentRecord), id: snapshot.id };
    if (comment.story_id !== storyId || comment.status !== "published") break;
    chain.push(comment);
    currentId = comment.parent_id;
  }
  if (!chain.length || chain[0]?.id !== commentId || chain[0]?.is_deleted) return null;

  chain.reverse();
  const authorIds = [
    ...new Set(
      chain
        .filter(
          (comment) =>
            comment.author_id &&
            (!comment.author_username ||
              !comment.author_photo_url ||
              !comment.author_membership_tier),
        )
        .map((comment) => comment.author_id as string),
    ),
  ];
  const profiles = await Promise.all(
    authorIds.map((authorId) => readDocument<ProfileRecord>("profiles", authorId)),
  );
  const profilesById = new Map(
    profiles.filter((profile) => profile).map((profile) => [profile!.id, profile!] as const),
  );
  const nodes = chain.map<PublicComment>((comment) => {
    const profile = comment.author_id ? profilesById.get(comment.author_id) : null;
    return {
      ...comment,
      body: comment.is_deleted ? "" : comment.body,
      author_username: comment.author_username ?? profile?.username ?? null,
      author_photo_url: comment.author_photo_url ?? profile?.photo_url ?? null,
      author_membership_tier:
        comment.author_membership_tier ?? membershipBadgeTier(profile ?? undefined),
      author_verified: Boolean(comment.author_verified),
      is_official: comment.author_id === "candid-official" || Boolean(comment.is_official),
      likes: Number(comment.likes ?? 0),
      replies: [],
    };
  });
  const byId = new Map(nodes.map((comment) => [comment.id, comment] as const));
  const roots: PublicComment[] = [];
  for (const comment of nodes) {
    const parent = comment.parent_id ? byId.get(comment.parent_id) : null;
    if (parent) parent.replies.push(comment);
    else roots.push(comment);
  }
  return omitDeletedCommentNodes(roots)[0] ?? null;
}

async function calculateSearchData(queryText: string) {
  const q = queryText.trim().toLowerCase();
  if (q.length < 2) return { companies: [], stories: [] };

  const db = getFirestoreDb();
  const [companies, stories] = await Promise.all([
    db
      .collection("companies")
      .limit(500)
      .get()
      .then((snapshot) => snapshot.docs.map((doc) => toRecord<CompanyRecord>(doc))),
    db
      .collection("stories")
      .where("status", "==", "published")
      .orderBy("created_at", "desc")
      .limit(500)
      .get()
      .then((snapshot) =>
        snapshot.docs.map((doc) => ({
          story: toRecord<StoryRecord>(doc),
          updateTime: doc.updateTime,
        })),
      ),
  ]);

  const companyMatches = companies
    .filter(isPublicCompany)
    .filter((company) =>
      [company.name, company.industry ?? "", company.county ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
    .slice(0, 10);

  const matchingRows = stories
    .filter(({ story }) => story.status === "published")
    .filter(({ story }) =>
      [story.title, story.body, story.company_name ?? "", story.industry ?? "", story.county ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
    .slice(0, 15);
  const matchingStories = matchingRows.map(({ story }) => story);
  await Promise.all(
    matchingRows.map(({ story, updateTime }) => getTopLevelCommentCount(story, updateTime)),
  );
  const authors = await Promise.all(
    [
      ...new Set(
        matchingStories.map((story) => story.author_id).filter((id): id is string => !!id),
      ),
    ].map((id) => readDocument<ProfileRecord>("profiles", id)),
  );
  const authorsById = new Map(
    authors.filter((author) => author).map((author) => [author!.id, author!] as const),
  );
  const storyMatches = matchingStories.map<PublicStoryRecord>((story) => {
    const author = story.author_id ? authorsById.get(story.author_id) : null;
    return {
      ...publicStoryFields(story),
      title: story.title,
      body: story.body,
      ...publicWorkplaceCoordinates(story),
      company_location_suggestion: null,
      created_at: story.created_at,
      id: story.id,
      company_id: story.company_id,
      company_name: story.company_name ?? null,
      company_slug: story.company_slug ?? null,
      company_verified: Boolean(story.company_verified),
      area: story.area ?? null,
      likes: Number(story.likes ?? 0),
      follower_count: Number(story.follower_count ?? 0),
      reasons: story.reasons ?? [],
      comment_count: story.comment_count,
      metoo: story.metoo,
      upvotes: story.upvotes,
      would_work_again: story.would_work_again,
      author_username: story.author_username ?? author?.username ?? null,
      author_membership_tier:
        story.author_membership_tier ?? membershipBadgeTier(author ?? undefined),
    };
  });

  return { companies: companyMatches, stories: storyMatches };
}

export function searchData(queryText: string) {
  const normalized = queryText.trim().toLowerCase();
  return cacheServerRead(`public:search:${normalized}`, 60_000, () =>
    calculateSearchData(queryText),
  );
}
