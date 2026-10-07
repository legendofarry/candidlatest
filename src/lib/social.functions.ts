import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireFirebaseAuth,
  requireVerifiedFirebaseAuth,
} from "@/integrations/firebase/auth-middleware";
import { getFirestoreDb } from "./firebase.server";

const storyInput = (input: unknown) => z.object({ story_id: z.string().min(1) }).parse(input);

export const followAccount = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { toggleAccountFollow } = await import("./social.server");
    return toggleAccountFollow(context.userId, data.user_id);
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

export const getStoryEngagement = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator(storyInput)
  .handler(async ({ data, context }) => {
    const { readStoryEngagement } = await import("./social.server");
    return readStoryEngagement(data.story_id, context.userId);
  });

export const getFollowedStories = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { listFollowedStories } = await import("./social.server");
    return listFollowedStories(context.userId);
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
  .handler(async ({ context }) => {
    const db = getFirestoreDb();
    const [stories, comments] = await Promise.all([
      db.collection("stories").where("author_id", "==", context.userId).get(),
      db.collection("comments").where("author_id", "==", context.userId).get(),
    ]);
    const storyRows = stories.docs.map((doc) => doc.data() as Record<string, unknown>);
    const commentRows = comments.docs.map((doc) => doc.data() as Record<string, unknown>);
    const group = (status: "active" | "inactive" | "pending") => ({
      stories: storyRows
        .filter((story) =>
          status === "active"
            ? story["status"] === "published"
            : status === "pending"
              ? story["status"] === "pending"
              : story["status"] !== "published" && story["status"] !== "pending",
        )
        .map((story) => ({
          id: String(story["id"] ?? ""),
          title: String(story["title"] ?? "Your story"),
          createdAt: String(story["created_at"] ?? ""),
          type: "story" as const,
        })),
      comments: commentRows
        .filter((comment) =>
          status === "active"
            ? comment["status"] === "published"
            : status === "pending"
              ? comment["status"] === "pending"
              : comment["status"] !== "published" && comment["status"] !== "pending",
        )
        .map((comment) => ({
          id: String(comment["id"] ?? ""),
          storyId: String(comment["story_id"] ?? ""),
          title: String(comment["body"] ?? "Your comment").slice(0, 110),
          createdAt: String(comment["created_at"] ?? ""),
          type: "comment" as const,
        })),
    });
    return { active: group("active"), inactive: group("inactive"), pending: group("pending") };
  });
