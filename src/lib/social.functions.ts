import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireFirebaseAuth,
  requireVerifiedFirebaseAuth,
} from "@/integrations/firebase/auth-middleware";
import { getFirestoreDb } from "./firebase.server";

const storyInput = (input: unknown) => z.object({ story_id: z.string().min(1) }).parse(input);

export const getMyFeedPreferences = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { readFeedPreferences } = await import("./social.server");
    return readFeedPreferences(context.userId);
  });

export const updateFeedPreference = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({
    kind: z.enum(["story", "author", "company"]),
    target_id: z.string().min(1).max(200),
    hidden: z.boolean(),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const { setFeedPreference } = await import("./social.server");
    return setFeedPreference(context.userId, data.kind, data.target_id, data.hidden);
  });

export const followAccount = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { toggleAccountFollow } = await import("./social.server");
    return toggleAccountFollow(context.userId, data.user_id);
  });

/** Small on-demand relationship lookup for contextual follow/block menus. */
export const getAccountRelationship = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const db = getFirestoreDb();
    const [followsTarget, targetFollowsViewer, block] = await Promise.all([
      db.collection("follows").doc(`${context.userId}:${data.user_id}`).get(),
      db.collection("follows").doc(`${data.user_id}:${context.userId}`).get(),
      db.collection("blocks").doc(`${context.userId}:${data.user_id}`).get(),
    ]);
    const followStatus = !followsTarget.exists
      ? "none"
      : followsTarget.get("status") === "pending"
        ? "pending"
        : "accepted";
    return {
      followStatus,
      isFollowing: followStatus === "accepted",
      followsYou: targetFollowsViewer.exists && targetFollowsViewer.get("status") !== "pending",
      isBlocked: block.exists,
    } as const;
  });

export const getFollowStats = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ user_id: z.string().min(1).nullable().default(null) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { readFollowStats } = await import("./social.server");
    const target = data.user_id ?? context.userId;
    const stats = await readFollowStats(target, context.userId);
    return {
      followers: stats.followers,
      following: stats.following,
      isFollowing: stats.isFollowing,
    };
  });

export const likeStory = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator(storyInput)
  .handler(async ({ data, context }) => {
    const { toggleStoryLike } = await import("./social.server");
    return toggleStoryLike(data.story_id, context.userId);
  });

export const followStory = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator(storyInput)
  .handler(async ({ data, context }) => {
    const { toggleStoryFollow } = await import("./social.server");
    return toggleStoryFollow(data.story_id, context.userId);
  });

export const saveStory = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator(storyInput)
  .handler(async ({ data, context }) => {
    const { toggleStorySave } = await import("./social.server");
    return toggleStorySave(data.story_id, context.userId);
  });

export const toggleMyProfileStoryPin = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator(storyInput)
  .handler(async ({ data, context }) => {
    const { toggleProfileStoryPin } = await import("./social.server");
    return toggleProfileStoryPin(data.story_id, context.userId);
  });

export const getSavedCommunityPosts = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.object({ createdAt: z.string(), id: z.string() }).nullable().default(null),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listSavedCommunityPosts } = await import("./social.server");
    return listSavedCommunityPosts(context.userId, data);
  });

export const getStoryEngagement = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator(storyInput)
  .handler(async ({ data, context }) => {
    const { readStoryEngagement } = await import("./social.server");
    return readStoryEngagement(data.story_id, context.userId);
  });

export const getFollowedStories = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.object({ lastSeenAt: z.string(), id: z.string() }).nullable().default(null),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { listFollowedStories } = await import("./social.server");
    return listFollowedStories(context.userId, data);
  });

export const getStoryCatchUp = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator(storyInput)
  .handler(async ({ data, context }) => {
    const { buildStoryCatchUp } = await import("./social.server");
    return buildStoryCatchUp(data.story_id, context.userId);
  });

export const markStoryCaughtUp = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator(storyInput)
  .handler(async ({ data, context }) => {
    const { markStorySeen } = await import("./social.server");
    return markStorySeen(data.story_id, context.userId);
  });

export const getMyContributions = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().min(1).max(30).default(20),
        category: z.enum(["all", "stories", "comments"]).default("all"),
        status: z.enum(["all", "published", "pending", "hidden"]).default("all"),
        cursor: z
          .object({
            stories: z.object({ createdAt: z.string(), id: z.string() }).nullable(),
            comments: z.object({ createdAt: z.string(), id: z.string() }).nullable(),
          })
          .nullable()
          .default(null),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const db = getFirestoreDb();
    const storiesRef = db.collection("stories");
    const commentsRef = db.collection("comments");
    let storiesQuery = storiesRef
      .where("author_id", "==", context.userId)
      .orderBy("created_at", "desc")
      .orderBy("__name__", "desc");
    let commentsQuery = commentsRef
      .where("author_id", "==", context.userId)
      .orderBy("created_at", "desc")
      .orderBy("__name__", "desc");
    if (data.status !== "all") {
      storiesQuery = storiesQuery.where("status", "==", data.status);
      commentsQuery = commentsQuery.where("status", "==", data.status);
    }
    if (data.category !== "comments" && data.cursor?.stories) {
      storiesQuery = storiesQuery.startAfter(
        data.cursor.stories.createdAt,
        storiesRef.doc(data.cursor.stories.id),
      );
    }
    if (data.category !== "stories" && data.cursor?.comments) {
      commentsQuery = commentsQuery.startAfter(
        data.cursor.comments.createdAt,
        commentsRef.doc(data.cursor.comments.id),
      );
    }
    const [stories, comments, storyCount, commentCount] = await Promise.all([
      data.category === "comments"
        ? Promise.resolve(null)
        : storiesQuery.limit(data.limit + 1).get(),
      data.category === "stories"
        ? Promise.resolve(null)
        : commentsQuery.limit(data.limit + 1).get(),
      data.cursor
        ? Promise.resolve(null)
        : (data.status === "all"
            ? storiesRef.where("author_id", "==", context.userId)
            : storiesRef.where("author_id", "==", context.userId).where("status", "==", data.status)
          ).count(),
      data.cursor
        ? Promise.resolve(null)
        : (data.status === "all"
            ? commentsRef.where("author_id", "==", context.userId)
            : commentsRef
                .where("author_id", "==", context.userId)
                .where("status", "==", data.status)
          ).count(),
    ]);
    const storyRows =
      stories?.docs.map((doc) => ({ ...doc.data(), id: doc.id, type: "story" as const })) ?? [];
    const commentRows =
      comments?.docs.map((doc) => ({ ...doc.data(), id: doc.id, type: "comment" as const })) ?? [];
    const storyTitles = new Map<string, { title: string; status: string }>();
    const commentStoryIds = [
      ...new Set(commentRows.map((comment) => String(comment["story_id"] ?? "")).filter(Boolean)),
    ];
    const relatedStories = await Promise.all(
      commentStoryIds.map((id) => db.collection("stories").doc(id).get()),
    );
    for (const story of relatedStories)
      if (story.exists)
        storyTitles.set(story.id, {
          title: String(story.data()?.["title"] ?? "Story"),
          status: String(story.data()?.["status"] ?? "hidden"),
        });
    const items = [...storyRows, ...commentRows]
      .sort(
        (a, b) =>
          String(b["created_at"] ?? "").localeCompare(String(a["created_at"] ?? "")) ||
          b.id.localeCompare(a.id),
      )
      .slice(0, data.limit);
    const consumedStory = items.filter((item) => item.type === "story").at(-1);
    const consumedComment = items.filter((item) => item.type === "comment").at(-1);
    const nextCursor = {
      stories: consumedStory
        ? { createdAt: String(consumedStory["created_at"] ?? ""), id: consumedStory.id }
        : (data.cursor?.stories ?? null),
      comments: consumedComment
        ? { createdAt: String(consumedComment["created_at"] ?? ""), id: consumedComment.id }
        : (data.cursor?.comments ?? null),
    };
    const hasMore =
      (data.category !== "stories" &&
        commentRows.length > items.filter((item) => item.type === "comment").length) ||
      (data.category !== "comments" &&
        storyRows.length > items.filter((item) => item.type === "story").length);
    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title:
          item.type === "story"
            ? String(item["title"] ?? "Your story")
            : String(item["body"] ?? "Your comment").slice(0, 160),
        body: String(item[item.type === "story" ? "body" : "body"] ?? ""),
        createdAt: String(item["created_at"] ?? ""),
        status: String(item["status"] ?? "published"),
        storyId: item.type === "comment" ? String(item["story_id"] ?? "") : item.id,
        storyTitle:
          item.type === "comment"
            ? (storyTitles.get(String(item["story_id"] ?? ""))?.title ?? "Workplace story")
            : String(item["title"] ?? "Your story"),
        storyStatus:
          item.type === "comment"
            ? (storyTitles.get(String(item["story_id"] ?? ""))?.status ?? "hidden")
            : String(item["status"] ?? "published"),
        companyName: item.type === "story" ? String(item["company_name"] ?? "") : null,
        isDeleted: item.type === "comment" && item["is_deleted"] === true,
        authorDeleted: item.type === "story" && item["author_deleted"] === true,
      })),
      counts: { stories: storyCount, comments: commentCount },
      hasMore,
      nextCursor: hasMore ? nextCursor : null,
    };
  });
