import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import {
  generateId,
  queryFirst,
  type CompanyRecord,
  type ProfileRecord,
  type StoryRecord,
} from "./firebase-data.server";
import { getFirestoreDb } from "./firebase.server";

const REASONS = [
  "delayed salary",
  "unpaid overtime",
  "harassment",
  "tribalism / nepotism",
  "no contract",
  "wrongful dismissal",
  "no statutory deductions",
  "toxic management",
  "good exit",
] as const;

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function randomHandle() {
  const adjectives = ["Quiet", "Frank", "Steady", "Wary", "Bold", "Patient"];
  const roles = ["Analyst", "Agent", "Driver", "Teller", "Engineer", "Officer", "Clerk"];
  return `Anon ${adjectives[Math.floor(Math.random() * adjectives.length)]} ${
    roles[Math.floor(Math.random() * roles.length)]
  }`;
}

/** Ensures the signed-in user has an anonymous profile handle. */
export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ county: z.string().max(60).nullable().default(null) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const existing = await queryFirst<ProfileRecord>("profiles", "id", context.userId);
    if (existing) return existing;

    const created: ProfileRecord = {
      id: context.userId,
      handle: randomHandle(),
      county: data.county,
      banned: false,
      created_at: new Date().toISOString(),
      role_label: null,
    };
    await db.collection("profiles").doc(context.userId).set(created);
    return created;
  });

export const findOrCreateCompany = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(2).max(120),
        industry: z.string().max(80).nullable().default(null),
        county: z.string().max(60).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const slug = slugify(data.name);
    const existing = (await queryFirst<CompanyRecord>("companies", "slug", slug)) ?? null;
    if (existing) return existing;

    const created: CompanyRecord = {
      id: generateId(),
      slug,
      name: data.name,
      industry: data.industry,
      county: data.county,
      verified: false,
      created_at: new Date().toISOString(),
    };
    await db.collection("companies").doc(created.id).set(created);

    try {
      const { researchCompany } = await import("./ai.server");
      const profile = await researchCompany({
        name: created.name,
        industry: created.industry,
        county: created.county,
      });
      if (profile) {
        await db
          .collection("company_ai_profiles")
          .doc(created.id)
          .set({
            company_id: created.id,
            ...profile,
            generated_at: new Date().toISOString(),
            locked: false,
          });
      }
    } catch (error) {
      console.error("[findOrCreateCompany] research failed", error);
    }

    return created;
  });

export const createStory = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        title: z.string().min(8).max(160),
        body: z.string().min(60).max(6000),
        reasons: z.array(z.enum(REASONS)).min(1).max(6),
        role_level: z.string().max(40).nullable().default(null),
        county: z.string().max(60).nullable().default(null),
        tenure: z.string().max(40).nullable().default(null),
        industry: z.string().max(80).nullable().default(null),
        would_work_again: z.boolean().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const { screenStory } = await import("./ai.server");
    const screen = await screenStory({ title: data.title, body: data.body });

    if (screen.verdict === "block") {
      return { ok: false as const, status: "blocked", message: screen.reason };
    }

    const company = await queryFirst<CompanyRecord>("companies", "id", data.company_id);
    if (!company) throw new Error("Company not found");

    const storyId = generateId();
    const created: StoryRecord = {
      id: storyId,
      company_id: company.id,
      company_name: company.name,
      company_slug: company.slug,
      title: data.title.trim(),
      body: data.body.trim(),
      reasons: data.reasons,
      role_level: data.role_level,
      county: data.county,
      tenure: data.tenure,
      industry: data.industry ?? company.industry,
      would_work_again: data.would_work_again,
      author_id: context.userId,
      status: screen.verdict === "publish" ? "published" : "pending",
      moderation_note: screen.verdict === "publish" ? null : screen.reason,
      upvotes: 0,
      metoo: 0,
      comment_count: 0,
      created_at: new Date().toISOString(),
    };

    await db.collection("stories").doc(storyId).set(created);
    return { ok: true as const, id: created.id, status: created.status };
  });

export const castVote = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ story_id: z.string().uuid(), kind: z.enum(["up", "metoo"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const voteId = `${data.story_id}:${context.userId}:${data.kind}`;
    const voteRef = db.collection("votes").doc(voteId);
    const existing = await voteRef.get();
    const storyRef = db.collection("stories").doc(data.story_id);
    const field = data.kind === "up" ? "upvotes" : "metoo";
    const storySnap = await storyRef.get();
    const currentStory = storySnap.exists ? storySnap.data() : null;

    if (existing.exists) {
      await voteRef.delete();
      await storyRef.update({
        [field]: Math.max(0, Number(currentStory?.[field] ?? 0) - 1),
      });
      return { voted: false };
    }

    await voteRef.set({
      id: voteId,
      story_id: data.story_id,
      user_id: context.userId,
      kind: data.kind,
      created_at: new Date().toISOString(),
    });
    await storyRef.update({ [field]: Number(currentStory?.[field] ?? 0) + 1 });
    return { voted: true };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        story_id: z.string().uuid(),
        parent_id: z.string().uuid().nullable().default(null),
        body: z.string().min(2).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const profile = await queryFirst<ProfileRecord>("profiles", "id", context.userId);
    const commentId = generateId();
    const storyRef = db.collection("stories").doc(data.story_id);
    const storySnap = await storyRef.get();
    const currentStory = storySnap.exists ? storySnap.data() : null;

    const verificationSnap = await db
      .collection("account_verifications")
      .doc(context.userId)
      .get();
    const verification = verificationSnap.exists
      ? (verificationSnap.data() as {
          account_type?: string;
          company_id?: string | null;
          badge_status?: string;
        })
      : null;
    const isOfficial = Boolean(
      verification?.account_type === "company" &&
        verification.company_id &&
        verification.company_id === currentStory?.["company_id"],
    );

    await db
      .collection("comments")
      .doc(commentId)
      .set({
        id: commentId,
        ...data,
        author_id: context.userId,
        author_handle: profile?.handle ?? "Anonymous",
        author_username: profile?.username ?? null,
        author_verified: verification?.badge_status === "claimed",
        is_official: isOfficial,
        likes: 0,
        status: "published",
        created_at: new Date().toISOString(),
      });
    await storyRef.update({ comment_count: Number(currentStory?.["comment_count"] ?? 0) + 1 });
    return { ok: true, id: commentId };
  });

/** Toggles a like on a comment or reply. */
export const likeComment = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ comment_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const likeRef = db.collection("comment_likes").doc(`${data.comment_id}:${context.userId}`);
    const commentRef = db.collection("comments").doc(data.comment_id);
    const [likeSnap, commentSnap] = await Promise.all([likeRef.get(), commentRef.get()]);
    const current = Number((commentSnap.data() as { likes?: number } | undefined)?.likes ?? 0);

    if (likeSnap.exists) {
      await likeRef.delete();
      await commentRef.update({ likes: Math.max(0, current - 1) });
      return { liked: false, likes: Math.max(0, current - 1) };
    }

    await likeRef.set({
      comment_id: data.comment_id,
      user_id: context.userId,
      created_at: new Date().toISOString(),
    });
    await commentRef.update({ likes: current + 1 });
    return { liked: true, likes: current + 1 };
  });

/** What the signed-in user has already done on this story (likes, votes, reports). */
export const getMyEngagement = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ story_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const [likes, votes, reports] = await Promise.all([
      db.collection("comment_likes").where("user_id", "==", context.userId).get(),
      db
        .collection("votes")
        .where("user_id", "==", context.userId)
        .where("story_id", "==", data.story_id)
        .get(),
      db.collection("reports").where("reporter_id", "==", context.userId).get(),
    ]);

    return {
      likedCommentIds: likes.docs.map(
        (doc) => (doc.data() as { comment_id: string }).comment_id,
      ),
      votedKinds: votes.docs.map((doc) => (doc.data() as { kind: string }).kind),
      reportedTargetIds: reports.docs.map(
        (doc) => (doc.data() as { target_id: string }).target_id,
      ),
    };
  });

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        target_type: z.enum(["story", "comment"]),
        target_id: z.string().uuid(),
        reasons: z.array(z.string().min(2).max(80)).min(1).max(6).optional(),
        reason: z.string().min(2).max(80).optional(),
        detail: z.string().max(1000).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const reasons = data.reasons ?? (data.reason ? [data.reason] : []);
    if (reasons.length === 0) throw new Error("Select at least one reason");

    // Deterministic id keeps reporting to once per user per target.
    const reportId = `${data.target_type}:${data.target_id}:${context.userId}`;
    const existing = await db.collection("reports").doc(reportId).get();
    if (existing.exists) return { ok: true, alreadyReported: true };

    await db
      .collection("reports")
      .doc(reportId)
      .set({
        id: reportId,
        target_type: data.target_type,
        target_id: data.target_id,
        reasons,
        reason: reasons.join(", "),
        detail: data.detail,
        reporter_id: context.userId,
        status: "open",
        created_at: new Date().toISOString(),
      });
    return { ok: true, alreadyReported: false };
  });

export const rateCompany = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        pay_on_time: z.number().min(1).max(5),
        compliance: z.number().min(1).max(5),
        respect: z.number().min(1).max(5),
        workload: z.number().min(1).max(5),
        growth: z.number().min(1).max(5),
        would_work_again: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const ratingId = `${data.company_id}:${context.userId}`;
    await db
      .collection("company_ratings")
      .doc(ratingId)
      .set({
        id: ratingId,
        ...data,
        user_id: context.userId,
        created_at: new Date().toISOString(),
      });
    return { ok: true };
  });

export const submitSalary = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid().nullable().default(null),
        role_title: z.string().min(2).max(80),
        industry: z.string().max(80).nullable().default(null),
        county: z.string().max(60).nullable().default(null),
        min_kes: z.number().min(0).max(10_000_000),
        max_kes: z.number().min(0).max(10_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const salaryId = generateId();
    await db
      .collection("salary_reports")
      .doc(salaryId)
      .set({
        id: salaryId,
        ...data,
        user_id: context.userId,
        created_at: new Date().toISOString(),
      });
    return { ok: true };
  });
