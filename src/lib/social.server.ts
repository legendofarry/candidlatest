import { getFirestoreDb } from "./firebase.server";
import { readCollection, type CommentRecord, type StoryRecord } from "./firebase-data.server";

export type FollowRecord = {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
};

export type StoryFollowRecord = {
  id: string;
  story_id: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
};

export type StoryLikeRecord = {
  id: string;
  story_id: string;
  user_id: string;
  created_at: string;
};

const now = () => new Date().toISOString();

/** Follows / unfollows another account. Returns the resulting state. */
export async function toggleAccountFollow(followerId: string, followingId: string) {
  if (followerId === followingId) throw new Error("You cannot follow yourself");
  const db = getFirestoreDb();
  const id = `${followerId}:${followingId}`;
  const ref = db.collection("follows").doc(id);
  const snap = await ref.get();

  if (snap.exists) {
    await ref.delete();
    return { following: false };
  }

  const record: FollowRecord = {
    id,
    follower_id: followerId,
    following_id: followingId,
    created_at: now(),
  };
  await ref.set(record);
  return { following: true };
}

/** Follower / following counts for a profile, plus the viewer's own relationship. */
export async function readFollowStats(profileId: string, viewerId: string | null) {
  const db = getFirestoreDb();
  const [followers, following] = await Promise.all([
    db.collection("follows").where("following_id", "==", profileId).get(),
    db.collection("follows").where("follower_id", "==", profileId).get(),
  ]);

  return {
    followers: followers.size,
    following: following.size,
    isFollowing: viewerId
      ? followers.docs.some(
          (doc) => (doc.data() as FollowRecord).follower_id === viewerId,
        )
      : false,
    followerIds: followers.docs.map((doc) => (doc.data() as FollowRecord).follower_id),
    followingIds: following.docs.map((doc) => (doc.data() as FollowRecord).following_id),
  };
}

/** Toggles a like on a story and keeps the denormalised counter in sync. */
export async function toggleStoryLike(storyId: string, userId: string) {
  const db = getFirestoreDb();
  const ref = db.collection("story_likes").doc(`${storyId}:${userId}`);
  const storyRef = db.collection("stories").doc(storyId);
  const [snap, storySnap] = await Promise.all([ref.get(), storyRef.get()]);
  const current = Number((storySnap.data() as { likes?: number } | undefined)?.likes ?? 0);

  if (snap.exists) {
    await ref.delete();
    const likes = Math.max(0, current - 1);
    await storyRef.update({ likes });
    return { liked: false, likes };
  }

  const record: StoryLikeRecord = {
    id: ref.id,
    story_id: storyId,
    user_id: userId,
    created_at: now(),
  };
  await ref.set(record);
  await storyRef.update({ likes: current + 1 });
  return { liked: true, likes: current + 1 };
}

/** Follows / unfollows a story so the user can track how it develops. */
export async function toggleStoryFollow(storyId: string, userId: string) {
  const db = getFirestoreDb();
  const ref = db.collection("story_follows").doc(`${storyId}:${userId}`);
  const snap = await ref.get();

  if (snap.exists) {
    await ref.delete();
    return { following: false };
  }

  const record: StoryFollowRecord = {
    id: ref.id,
    story_id: storyId,
    user_id: userId,
    created_at: now(),
    last_seen_at: now(),
  };
  await ref.set(record);
  return { following: true };
}

/** Everything the viewer has engaged with on a story. */
export async function readStoryEngagement(storyId: string, userId: string) {
  const db = getFirestoreDb();
  const [like, follow] = await Promise.all([
    db.collection("story_likes").doc(`${storyId}:${userId}`).get(),
    db.collection("story_follows").doc(`${storyId}:${userId}`).get(),
  ]);
  return { liked: like.exists, following: follow.exists };
}

export type FollowedStory = {
  story_id: string;
  title: string | null;
  company_name: string | null;
  last_seen_at: string;
  new_comments: number;
  total_comments: number;
};

/** Stories the user follows, annotated with what has changed since their last visit. */
export async function listFollowedStories(userId: string): Promise<FollowedStory[]> {
  const db = getFirestoreDb();
  const follows = await db.collection("story_follows").where("user_id", "==", userId).get();
  if (follows.empty) return [];

  const records = follows.docs.map((doc) => doc.data() as StoryFollowRecord);
  const [stories, comments] = await Promise.all([
    readCollection<StoryRecord>("stories"),
    readCollection<CommentRecord>("comments"),
  ]);
  const storyById = new Map(stories.map((story) => [story.id, story] as const));

  return records
    .map((record) => {
      const story = storyById.get(record.story_id) ?? null;
      const storyComments = comments.filter((comment) => comment.story_id === record.story_id);
      const since = new Date(record.last_seen_at).getTime();
      return {
        story_id: record.story_id,
        title: story?.title ?? null,
        company_name: story?.company_name ?? null,
        last_seen_at: record.last_seen_at,
        new_comments: storyComments.filter(
          (comment) => new Date(comment.created_at).getTime() > since,
        ).length,
        total_comments: storyComments.length,
      };
    })
    .sort((a, b) => b.new_comments - a.new_comments);
}

/** Marks a followed story as caught up. */
export async function markStorySeen(storyId: string, userId: string) {
  const db = getFirestoreDb();
  const ref = db.collection("story_follows").doc(`${storyId}:${userId}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false };
  await ref.update({ last_seen_at: now() });
  return { ok: true };
}

/** Builds an AI catch-up on everything that happened since the user last looked. */
export async function buildStoryCatchUp(storyId: string, userId: string) {
  const db = getFirestoreDb();
  const followSnap = await db.collection("story_follows").doc(`${storyId}:${userId}`).get();
  const record = followSnap.exists ? (followSnap.data() as StoryFollowRecord) : null;
  const since = record ? new Date(record.last_seen_at).getTime() : 0;

  const [storyDoc, comments] = await Promise.all([
    db.collection("stories").doc(storyId).get(),
    readCollection<CommentRecord>("comments"),
  ]);
  const story = storyDoc.exists ? (storyDoc.data() as StoryRecord) : null;
  const fresh = comments
    .filter(
      (comment) =>
        comment.story_id === storyId && new Date(comment.created_at).getTime() > since,
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (fresh.length === 0) {
    return {
      since: record?.last_seen_at ?? null,
      newCount: 0,
      summary: "Nothing new since you last checked in on this story.",
    };
  }

  const { summarizeStoryActivity } = await import("./ai.server");
  const summary = await summarizeStoryActivity({
    title: story?.title ?? "This story",
    body: story?.body ?? "",
    comments: fresh.slice(0, 40).map((comment) => comment.body),
  });

  return { since: record?.last_seen_at ?? null, newCount: fresh.length, summary };
}
