import { getFirestoreDb } from "./firebase.server";
import { pushServerNotification } from "./notifications.server";

const MAX_COMPANY_WATCHES = 50;

type CompanyWatchRecord = {
  id: string;
  user_id: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  watched_at: string;
  last_notified_at?: string;
  last_notified_event_id?: string | null;
};

type CompanyWatchEvent = {
  id: string;
  story_id: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  story_title: string;
  author_id: string | null;
  created_at: string;
};

export async function listCompanyWatches(userId: string) {
  const snapshot = await getFirestoreDb()
    .collection("company_watches")
    .where("user_id", "==", userId)
    .limit(MAX_COMPANY_WATCHES)
    .get();
  return snapshot.docs
    .map((doc) => ({ ...(doc.data() as CompanyWatchRecord), id: doc.id }))
    .sort((a, b) => b.watched_at.localeCompare(a.watched_at));
}

export async function getCompanyWatch(userId: string, companyId: string) {
  const id = `company-watch:${userId}:${companyId}`;
  const snapshot = await getFirestoreDb().collection("company_watches").doc(id).get();
  return snapshot.exists;
}

export async function setCompanyWatch(input: {
  userId: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  watching: boolean;
}) {
  const db = getFirestoreDb();
  const id = `company-watch:${input.userId}:${input.companyId}`;
  const ref = db.collection("company_watches").doc(id);
  const existing = await ref.get();

  if (!input.watching) {
    if (existing.exists) await ref.delete();
    return { watching: false };
  }

  if (!existing.exists) {
    const watches = await db
      .collection("company_watches")
      .where("user_id", "==", input.userId)
      .limit(MAX_COMPANY_WATCHES)
      .get();
    if (watches.size >= MAX_COMPANY_WATCHES) {
      throw new Error(`You can watch up to ${MAX_COMPANY_WATCHES} companies.`);
    }
  }

  const watchedAt = existing.get("watched_at");
  await ref.set({
    id,
    user_id: input.userId,
    company_id: input.companyId,
    company_name: input.companyName,
    company_slug: input.companySlug,
    watched_at: typeof watchedAt === "string" ? watchedAt : new Date().toISOString(),
    last_notified_at:
      typeof existing.get("last_notified_at") === "string"
        ? existing.get("last_notified_at")
        : typeof watchedAt === "string"
          ? watchedAt
          : new Date().toISOString(),
    last_notified_event_id:
      typeof existing.get("last_notified_event_id") === "string"
        ? existing.get("last_notified_event_id")
        : null,
  });
  return { watching: true };
}

/** Records a public-story event for lazy, per-watcher notification delivery. */
export async function recordCompanyWatchEvent(input: {
  storyId: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  storyTitle: string;
  authorId: string | null;
  publishedAt: string;
}) {
  const id = `company-watch-event:${input.storyId}:${input.publishedAt}`;
  const event: CompanyWatchEvent = {
    id,
    story_id: input.storyId,
    company_id: input.companyId,
    company_name: input.companyName,
    company_slug: input.companySlug,
    story_title: input.storyTitle.slice(0, 160),
    author_id: input.authorId,
    created_at: input.publishedAt,
  };
  try {
    await getFirestoreDb().collection("company_watch_events").doc(id).create(event);
  } catch (error) {
    if (error instanceof Error && /\[(409|412)\]/.test(error.message)) return;
    throw error;
  }
}

/** Materializes recent events for this member into their normal notification inbox. */
export async function syncCompanyWatchNotifications(userId: string) {
  const watches = await listCompanyWatches(userId);
  if (watches.length === 0) return;

  const db = getFirestoreDb();
  const pendingByWatch = await Promise.all(
    watches.map(async (watch) => {
      const base = db
        .collection("company_watch_events")
        .where("company_id", "==", watch.company_id)
        .orderBy("created_at", "asc")
        .orderBy("__name__", "asc");
      const cursorAt = watch.last_notified_at ?? watch.watched_at;
      const query = watch.last_notified_event_id
        ? base.startAfter(
            cursorAt,
            db.collection("company_watch_events").doc(watch.last_notified_event_id),
          )
        : base.where("created_at", ">", cursorAt);
      const snapshot = await query.limit(20).get();
      return snapshot.docs.map((doc) => ({
        watch,
        event: { ...(doc.data() as CompanyWatchEvent), id: doc.id },
      }));
    }),
  );
  const pending = pendingByWatch
    .flat()
    .sort((a, b) => a.event.created_at.localeCompare(b.event.created_at))
    .slice(0, 20);

  for (const { watch, event } of pending) {
    const story = await db.collection("stories").doc(event.story_id).get();
    if (story.exists && story.get("status") === "published" && event.author_id !== userId) {
      await pushServerNotification({
        id: `company-watch-notification:${userId}:${event.id}`,
        userId,
        kind: "info",
        title: `New story about ${event.company_name}`,
        description: `“${event.story_title}”`,
        link: `/stories/${encodeURIComponent(event.story_id)}`,
        activityType: "company_story",
      });
    }
    await db.collection("company_watches").doc(watch.id).update({
      last_notified_at: event.created_at,
      last_notified_event_id: event.id,
    });
  }
}
