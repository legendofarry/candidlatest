import { getFirestoreDb } from "./firebase.server";

export type FeedPreferenceKind = "story" | "author" | "company";
export type FeedPreference = {
  kind: FeedPreferenceKind;
  target_id: string;
  label: string;
  updated_at: string;
};

const FEED_PREFERENCE_LIMIT = 200;

export async function readFeedPreferences(userId: string) {
  const snapshot = await getFirestoreDb().collection("feed_preferences").doc(userId).get();
  return (snapshot.data()?.["items"] as FeedPreference[] | undefined) ?? [];
}

export async function setFeedPreference(
  userId: string,
  kind: FeedPreferenceKind,
  targetId: string,
  hidden: boolean,
) {
  const db = getFirestoreDb();
  const ref = db.collection("feed_preferences").doc(userId);
  const key = `${kind}:${targetId}`;
  let label = targetId;
  if (hidden) {
    if (kind === "story") {
      const story = await db.collection("stories").doc(targetId).get();
      label = String(story.get("title") ?? story.get("company_name") ?? "Post");
    } else if (kind === "author") {
      const profile = await db.collection("profiles").doc(targetId).get();
      label = `@${String(profile.get("username") ?? "member")}`;
    } else {
      const company = await db.collection("companies").doc(targetId).get();
      label = String(company.get("name") ?? "Employer");
    }
  }
  const updatedAt = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = (snapshot.data()?.["items"] as FeedPreference[] | undefined) ?? [];
    const remaining = current.filter((item) => `${item.kind}:${item.target_id}` !== key);
    const items = hidden
      ? [...remaining, { kind, target_id: targetId, label, updated_at: updatedAt }].slice(
          -FEED_PREFERENCE_LIMIT,
        )
      : remaining;
    transaction.set(ref, { user_id: userId, items, updated_at: updatedAt });
  });
  return readFeedPreferences(userId);
}
import { type CommentRecord, type StoryRecord } from "./firebase-data.server";
import { getEffectiveMembershipTier, getMembershipEntitlements } from "./membership";

export type FollowRecord = {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
  status?: "pending" | "accepted";
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
  const [snap, targetSnap] = await Promise.all([
    ref.get(),
    db.collection("profiles").doc(followingId).get(),
  ]);
  const target = targetSnap.data() as
    { banned?: boolean; account_status?: string; profile_visibility?: string } | undefined;
  if (!targetSnap.exists || !target || target.banned || target.account_status === "deactivated") {
    throw new Error("This account is unavailable.");
  }

  if (snap.exists) {
    await ref.delete();
    return { following: false, requested: false, status: "none" as const };
  }

  const requested = target.profile_visibility === "private";
  const record: FollowRecord = {
    id,
    follower_id: followerId,
    following_id: followingId,
    created_at: now(),
    status: requested ? "pending" : "accepted",
  };
  await ref.set(record);
  if (requested) {
    try {
      const [{ pushServerNotification }, actorSnap] = await Promise.all([
        import("./notifications.server"),
        db.collection("profiles").doc(followerId).get(),
      ]);
      const actorProfile = actorSnap.data() as
        | { username?: string | null; photo_url?: string | null }
        | undefined;
      const actorName = actorProfile?.username ? `@${actorProfile.username}` : "Someone";
      await pushServerNotification({
        userId: followingId,
        kind: "info",
        title: `${actorName} requested to follow you`,
        description: "Your profile is private. Review this request to choose whether to accept it.",
        link: "/settings",
        activityType: "follow_request",
        actor: {
          id: followerId,
          username: actorProfile?.username ?? null,
          photoUrl: actorProfile?.photo_url ?? null,
        },
      });
    } catch (error) {
      console.warn("[follow request] notification failed", error);
    }
  }
  if (!requested) {
    try {
      const [{ pushServerNotification }, actorSnap] = await Promise.all([
        import("./notifications.server"),
        db.collection("profiles").doc(followerId).get(),
      ]);
      const actorProfile = actorSnap.data() as
        | { username?: string | null; photo_url?: string | null }
        | undefined;
      const actorName = actorProfile?.username ? `@${actorProfile.username}` : "Someone";
      await pushServerNotification({
        userId: followingId,
        kind: "info",
        title: `${actorName} followed you`,
        description: "Open their profile to see who joined your community.",
        actor: {
          id: followerId,
          username: actorProfile?.username ?? null,
          photoUrl: actorProfile?.photo_url ?? null,
        },
        link: actorProfile?.username ? `/u/${encodeURIComponent(actorProfile.username)}` : null,
        activityType: "follow",
      });
    } catch (error) {
      console.warn("[follow] notification failed", error);
    }
  }
  return {
    following: !requested,
    requested,
    status: requested ? ("pending" as const) : ("accepted" as const),
  };
}

/** Follower / following counts for a profile, plus the viewer's own relationship. */
export async function readFollowStats(profileId: string, viewerId: string | null) {
  const db = getFirestoreDb();
  const [allFollowers, allFollowing, pendingFollowers, pendingFollowing, viewerFollow] =
    await Promise.all([
      db.collection("follows").where("following_id", "==", profileId).count(),
      db.collection("follows").where("follower_id", "==", profileId).count(),
      db
        .collection("follows")
        .where("following_id", "==", profileId)
        .where("status", "==", "pending")
        .count(),
      db
        .collection("follows")
        .where("follower_id", "==", profileId)
        .where("status", "==", "pending")
        .count(),
      viewerId
        ? db.collection("follows").doc(`${viewerId}:${profileId}`).get()
        : Promise.resolve(null),
    ]);

  return {
    followers: Math.max(0, allFollowers - pendingFollowers),
    following: Math.max(0, allFollowing - pendingFollowing),
    isFollowing: Boolean(viewerFollow?.exists && viewerFollow.get("status") !== "pending"),
    followStatus: viewerFollow?.exists
      ? viewerFollow.get("status") === "pending"
        ? "pending"
        : "accepted"
      : "none",
  };
}

/** Toggles a like on a story and keeps the denormalised counter in sync. */
export async function toggleStoryLike(storyId: string, userId: string) {
  const db = getFirestoreDb();
  const ref = db.collection("story_likes").doc(`${storyId}:${userId}`);
  const storyRef = db.collection("stories").doc(storyId);
  const result = await db.runTransaction(async (transaction) => {
    const [snap, storySnap] = await Promise.all([transaction.get(ref), transaction.get(storyRef)]);
    if (!storySnap.exists || storySnap.get("status") !== "published") {
      throw new Error("This post is no longer available.");
    }
    const story = storySnap.data() as { likes?: number; author_id?: string | null; title?: string };
    const current = Math.max(0, Number(story.likes ?? 0));
    if (snap.exists) {
      const likes = Math.max(0, current - 1);
      transaction.delete(ref);
      transaction.update(storyRef, { likes });
      return { liked: false, likes, story };
    }
    const likes = current + 1;
    transaction.create(ref, {
      id: ref.id,
      story_id: storyId,
      user_id: userId,
      created_at: now(),
    } satisfies StoryLikeRecord);
    transaction.update(storyRef, { likes });
    return { liked: true, likes, story };
  });

  if (result.liked && result.story.author_id && result.story.author_id !== userId) {
    try {
      const [{ pushServerNotification }, actorSnap] = await Promise.all([
        import("./notifications.server"),
        db.collection("profiles").doc(userId).get(),
      ]);
      const actorProfile = actorSnap.data() as
        | { username?: string | null; photo_url?: string | null }
        | undefined;
      const actorName = actorProfile?.username ? `@${actorProfile.username}` : "Someone";
      await pushServerNotification({
        userId: result.story.author_id,
        kind: "info",
        title: `${actorName} liked your post`,
        description: `“${result.story.title ?? "your story"}”`,
        link: `/stories/${storyId}`,
        activityType: "post_like",
        actor: {
          id: userId,
          username: actorProfile?.username ?? null,
          photoUrl: actorProfile?.photo_url ?? null,
        },
      });
    } catch (error) {
      console.error("[toggleStoryLike] author notification failed", error);
    }
  }
  return { liked: result.liked, likes: result.likes };
}

/** Follows / unfollows a story so the user can track how it develops. */
export async function toggleStoryFollow(storyId: string, userId: string) {
  const db = getFirestoreDb();
  const ref = db.collection("story_follows").doc(`${storyId}:${userId}`);
  const storyRef = db.collection("stories").doc(storyId);
  return db.runTransaction(async (transaction) => {
    const [snap, storySnap] = await Promise.all([transaction.get(ref), transaction.get(storyRef)]);
    const existingCount = Math.max(
      Number((storySnap.data() as { follower_count?: number } | undefined)?.follower_count ?? 0),
    );
    const followers = Math.max(0, existingCount + (snap.exists ? -1 : 1));
    if (snap.exists) {
      transaction.delete(ref);
      if (storySnap.exists) transaction.update(storyRef, { follower_count: followers });
      return { following: false, followers };
    }

    const timestamp = now();
    transaction.set(ref, {
      id: ref.id,
      story_id: storyId,
      user_id: userId,
      created_at: timestamp,
      last_seen_at: timestamp,
    } satisfies StoryFollowRecord);
    if (storySnap.exists) transaction.update(storyRef, { follower_count: followers });
    return { following: true, followers };
  });
}

/** Saves or removes a story from the viewer's private bookmarks. */
export async function toggleStorySave(storyId: string, userId: string) {
  const db = getFirestoreDb();
  const ref = db.collection("story_saves").doc(`${storyId}:${userId}`);
  const storyRef = db.collection("stories").doc(storyId);
  return db.runTransaction(async (transaction) => {
    const [snap, storySnap] = await Promise.all([transaction.get(ref), transaction.get(storyRef)]);
    if (
      !storySnap.exists ||
      (storySnap.data() as { status?: string } | undefined)?.status !== "published"
    ) {
      throw new Error("This post is no longer available.");
    }
    if (snap.exists) {
      transaction.delete(ref);
      return { saved: false };
    }
    transaction.create(ref, {
      id: ref.id,
      story_id: storyId,
      user_id: userId,
      created_at: now(),
    });
    return { saved: true };
  });
}

/** Pins one of the author's published stories to their public profile. */
export async function toggleProfileStoryPin(storyId: string, userId: string) {
  const db = getFirestoreDb();
  const profileRef = db.collection("profiles").doc(userId);
  const storyRef = db.collection("stories").doc(storyId);

  return db.runTransaction(async (transaction) => {
    const [profileSnap, storySnap] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(storyRef),
    ]);
    if (!profileSnap.exists) throw new Error("Could not find your Candid profile.");
    const story = storySnap.data() as (StoryRecord & { status?: string }) | undefined;
    if (!storySnap.exists || story?.author_id !== userId) {
      throw new Error("You can only pin stories you have posted.");
    }

    const profile = profileSnap.data() as {
      pinned_story_ids?: unknown;
      subscription_tier?: "basic" | "premium" | "gold";
      subscription_status?: "active" | "cancelled" | "expired" | "past_due";
      subscription_period_ends_at?: string | null;
      subscription_source?: "default" | "complimentary" | "manual" | "paid";
      account_type?: "individual" | "company" | "official" | "unknown";
    };
    const pinnedIds = Array.isArray(profile.pinned_story_ids)
      ? [...new Set(profile.pinned_story_ids.filter((id): id is string => typeof id === "string"))]
      : [];
    const alreadyPinned = pinnedIds.includes(storyId);
    if (alreadyPinned) {
      const nextPinnedIds = pinnedIds.filter((id) => id !== storyId);
      transaction.update(profileRef, { pinned_story_ids: nextPinnedIds });
      return { pinned: false, pinnedCount: nextPinnedIds.length };
    }

    if (story.status !== "published") {
      throw new Error("Only published stories can be pinned to your profile.");
    }
    const tier = getEffectiveMembershipTier(profile);
    const limit = getMembershipEntitlements(tier).maxPinnedStories;
    if (limit === 0) {
      throw new Error("Story pins are included with Premium. Upgrade from Billing.");
    }
    if (pinnedIds.length >= limit) {
      throw new Error(
        `Your Premium package allows up to ${limit} pinned ${limit === 1 ? "story" : "stories"}.`,
      );
    }

    const nextPinnedIds = [...pinnedIds, storyId];
    transaction.update(profileRef, { pinned_story_ids: nextPinnedIds });
    return { pinned: true, pinnedCount: nextPinnedIds.length };
  });
}

export async function listSavedCommunityPosts(
  userId: string,
  input: { limit: number; cursor?: { createdAt: string; id: string } | null },
) {
  const db = getFirestoreDb();
  let query = db
    .collection("story_saves")
    .where("user_id", "==", userId)
    .orderBy("created_at", "desc")
    .orderBy("__name__", "desc");
  if (input.cursor) {
    query = query.startAfter(
      input.cursor.createdAt,
      db.collection("story_saves").doc(input.cursor.id),
    );
  }
  const snapshot = await query.limit(input.limit + 1).get();
  const hasMore = snapshot.size > input.limit;
  const saved = snapshot.docs.slice(0, input.limit).map((doc) => ({
    id: doc.id,
    ...(doc.data() as { story_id: string; created_at: string }),
  }));
  const stories = await Promise.all(
    saved.map((item) => db.collection("stories").doc(item.story_id).get()),
  );
  const items = stories
    .filter((doc) => {
      const story = doc.data() as StoryRecord | undefined;
      return doc.exists && story?.status === "published" && story.post_type === "announcement";
    })
    .map((doc) => {
      const story = doc.data() as StoryRecord;
      return {
        id: story.id,
        body: story.body,
        created_at: story.created_at,
        media: story.media ?? [],
      };
    });
  const last = saved.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

/** Everything the viewer has engaged with on a story. */
export async function readStoryEngagement(storyId: string, userId: string) {
  const db = getFirestoreDb();
  const [like, follow, save, votes] = await Promise.all([
    db.collection("story_likes").doc(`${storyId}:${userId}`).get(),
    db.collection("story_follows").doc(`${storyId}:${userId}`).get(),
    db.collection("story_saves").doc(`${storyId}:${userId}`).get(),
    db.collection("votes").where("story_id", "==", storyId).where("user_id", "==", userId).get(),
  ]);
  return {
    liked: like.exists,
    following: follow.exists,
    saved: save.exists,
    votedKinds: votes.docs.map((doc) => (doc.data() as { kind: string }).kind),
  };
}

export type FollowedStory = {
  story_id: string;
  title: string | null;
  company_name: string | null;
  company_verified: boolean;
  last_seen_at: string;
  new_comments: number;
  total_comments: number;
};

/** Stories the user follows, annotated with what has changed since their last visit. */
export async function listFollowedStories(
  userId: string,
  input: {
    limit: number;
    cursor?: { lastSeenAt: string; id: string } | null;
  },
): Promise<{
  items: FollowedStory[];
  hasMore: boolean;
  nextCursor: { lastSeenAt: string; id: string } | null;
}> {
  const db = getFirestoreDb();
  let query = db
    .collection("story_follows")
    .where("user_id", "==", userId)
    .orderBy("last_seen_at", "desc")
    .orderBy("__name__", "desc");
  if (input.cursor) {
    query = query.startAfter(
      input.cursor.lastSeenAt,
      db.collection("story_follows").doc(input.cursor.id),
    );
  }
  const follows = await query.limit(input.limit + 1).get();
  const hasMore = follows.size > input.limit;
  const records = follows.docs.slice(0, input.limit).map((doc) => ({
    ...(doc.data() as StoryFollowRecord),
    id: doc.id,
  }));
  if (!records.length) return { items: [], hasMore: false, nextCursor: null };

  const storyIds = [...new Set(records.map((record) => record.story_id))];
  const [stories, comments] = await Promise.all([
    Promise.all(storyIds.map((id) => db.collection("stories").doc(id).get())),
    Promise.all(
      records.map(async (record) => {
        const recent = await db
          .collection("comments")
          .where("story_id", "==", record.story_id)
          .where("status", "==", "published")
          .where("created_at", ">", record.last_seen_at)
          .count();
        return [record.story_id, recent] as const;
      }),
    ),
  ]);
  const storyById = new Map(
    stories.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data() as StoryRecord] as const),
  );
  const commentCounts = new Map(comments);
  const items = records
    .map((record) => {
      const story = storyById.get(record.story_id) ?? null;
      const recentComments = commentCounts.get(record.story_id) ?? 0;
      return {
        story_id: record.story_id,
        title: story?.title ?? null,
        company_name: story?.company_name ?? null,
        company_verified: Boolean(story?.company_verified),
        last_seen_at: record.last_seen_at,
        new_comments: recentComments,
        total_comments: Number(story?.comment_count ?? 0),
      };
    })
    .sort((a, b) => b.new_comments - a.new_comments);
  const last = records.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? { lastSeenAt: last.last_seen_at, id: last.id } : null,
  };
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

/** Builds a chronological follow-up for a story the user follows. */
export async function buildStoryCatchUp(storyId: string, userId: string) {
  const db = getFirestoreDb();
  const followSnap = await db.collection("story_follows").doc(`${storyId}:${userId}`).get();
  if (!followSnap.exists) throw new Error("Follow this story to view its timeline.");

  const [storyDoc, commentSnap, totalComments] = await Promise.all([
    db.collection("stories").doc(storyId).get(),
    db
      .collection("comments")
      .where("story_id", "==", storyId)
      .where("status", "==", "published")
      .orderBy("created_at", "desc")
      .limit(100)
      .get(),
    db
      .collection("comments")
      .where("story_id", "==", storyId)
      .where("status", "==", "published")
      .count(),
  ]);
  const story = storyDoc.exists ? (storyDoc.data() as StoryRecord) : null;
  if (!story || story.status !== "published") throw new Error("This story is no longer available.");

  const timeline = commentSnap.docs
    .map((doc) => doc.data() as CommentRecord)
    .filter((comment) => comment.status === "published")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const { summarizeStoryActivity } = await import("./ai.server");
  const summary = timeline.length
    ? await summarizeStoryActivity({
        title: story?.title ?? "This story",
        body: story?.body ?? "",
        comments: timeline.slice(-40).map((comment) => comment.body),
      })
    : "The story has been shared, and there are no published replies yet.";

  return {
    story: {
      title: story.title,
      body: story.body,
      created_at: story.created_at,
      company_name: story.company_name,
    },
    summary,
    timeline: timeline.map((comment) => ({
      id: comment.id,
      body: comment.body,
      created_at: comment.created_at,
      official: Boolean(comment.is_official),
    })),
    totalUpdates: totalComments,
    hasMoreUpdates: totalComments > timeline.length,
    latestUpdateAt: timeline.at(-1)?.created_at ?? story.created_at,
  };
}
