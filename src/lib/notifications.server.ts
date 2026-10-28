import { generateId } from "./firebase-data.server";
import { getFirestoreDb } from "./firebase.server";
import type { NotificationActivityType } from "./notifications-store";

export type ServerNotificationRecord = {
  id: string;
  user_id: string;
  category?: "activity" | "message";
  kind: "success" | "error" | "info" | "warning";
  title: string;
  description: string | null;
  actor_id?: string | null;
  actor_username?: string | null;
  actor_photo_url?: string | null;
  activity_type?: NotificationActivityType;
  link: string | null;
  created_at: string;
};

/**
 * Older notification rows predate actor fields. Their descriptions still carry
 * an @handle, so present those rows like modern activity instead of leaving
 * people with generic "Your story got a like" wording forever.
 */
function legacyActorHandle(item: ServerNotificationRecord) {
  if (item.actor_username) return item.actor_username.replace(/^@/, "");
  const match = item.description?.match(/(?:^|\s)@([a-z0-9_.-]{2,40})\b/i);
  return match?.[1] ?? null;
}

function modernLegacyTitle(item: ServerNotificationRecord, username: string) {
  const actor = `@${username}`;
  const text = `${item.title} ${item.description ?? ""}`.toLowerCase();
  if (text.includes("follow request") || text.includes("asked to follow")) {
    return `${actor} requested to follow you`;
  }
  if (text.includes("new follower") || text.includes("followed you"))
    return `${actor} followed you`;
  if (text.includes("comment got a like") || text.includes("liked your comment")) {
    return `${actor} liked your comment`;
  }
  if (
    text.includes("story got a like") ||
    text.includes("post got a like") ||
    text.includes("liked \u201c")
  ) {
    return `${actor} liked your post`;
  }
  if (text.includes("repl")) return `${actor} replied to your comment`;
  if (text.includes("comment")) return `${actor} commented on your post`;
  if (text.includes("mention")) return `${actor} mentioned you`;
  return item.title;
}

async function hydrateLegacyActivity(items: ServerNotificationRecord[]) {
  const needsActor = items.filter(
    (item) => !item.actor_id && !item.actor_username && Boolean(legacyActorHandle(item)),
  );
  if (needsActor.length === 0) return items;

  const db = getFirestoreDb();
  const handles = [
    ...new Set(
      needsActor.map(legacyActorHandle).filter((value): value is string => Boolean(value)),
    ),
  ];
  const usernameRefs = handles.map((handle) =>
    db.collection("usernames").doc(handle.toLowerCase()),
  );
  // The edge Firestore REST adapter exposes DocumentReference.get(), not the
  // Admin SDK's db.getAll(). Keep this compatible with the production runtime.
  const usernameSnaps = await Promise.all(usernameRefs.map((ref) => ref.get()));
  const idsByHandle = new Map<string, string>();
  for (const snap of usernameSnaps) {
    const userId = (snap.data() as { user_id?: unknown } | undefined)?.user_id;
    if (typeof userId === "string" && userId) idsByHandle.set(snap.id.toLowerCase(), userId);
  }
  const profileRefs = [...new Set(idsByHandle.values())].map((id) =>
    db.collection("profiles").doc(id),
  );
  const profileSnaps = await Promise.all(profileRefs.map((ref) => ref.get()));
  const profiles = new Map<string, { username?: string | null; photo_url?: string | null }>();
  for (const snap of profileSnaps) {
    if (snap.exists)
      profiles.set(snap.id, snap.data() as { username?: string | null; photo_url?: string | null });
  }

  return items.map((item) => {
    if (item.actor_id || item.actor_username) return item;
    const handle = legacyActorHandle(item);
    if (!handle) return item;
    const userId = idsByHandle.get(handle.toLowerCase());
    const profile = userId ? profiles.get(userId) : null;
    const username = profile?.username ?? handle;
    return {
      ...item,
      actor_id: userId ?? null,
      actor_username: username,
      actor_photo_url: profile?.photo_url ?? null,
      title: modernLegacyTitle(item, username),
    };
  });
}

/** Durable cross-device notification stored in Firestore. */
export async function pushServerNotification(input: {
  id?: string;
  userId: string;
  category?: ServerNotificationRecord["category"];
  kind: ServerNotificationRecord["kind"];
  title: string;
  description?: string | null;
  actor?: { id: string; username?: string | null; photoUrl?: string | null } | null;
  activityType?: NotificationActivityType;
  link?: string | null;
}) {
  const db = getFirestoreDb();
  const record: ServerNotificationRecord = {
    id: input.id ?? generateId(),
    user_id: input.userId,
    category: input.category ?? "activity",
    kind: input.kind,
    title: input.title.slice(0, 140),
    description: input.description?.slice(0, 300) ?? null,
    actor_id: input.actor?.id ?? null,
    actor_username: input.actor?.username?.slice(0, 40) ?? null,
    actor_photo_url: input.actor?.photoUrl?.slice(0, 1000) ?? null,
    activity_type: input.activityType ?? "other",
    link: input.link ?? null,
    created_at: new Date().toISOString(),
  };
  const ref = db.collection("notifications").doc(record.id);
  try {
    await ref.create(record);
  } catch (error) {
    if (error instanceof Error && /\[(409|412)\]/.test(error.message)) return record;
    throw error;
  }
  const { dispatchWebPush } = await import("./push.server");
  await dispatchWebPush(input.userId, {
    title: record.title,
    body: record.description,
    link: record.link,
    notificationId: record.id,
  });
  return record;
}

export async function listServerNotifications(
  userId: string,
  limit = 20,
  cursor?: { createdAt: string; id: string } | null,
) {
  const db = getFirestoreDb();
  const baseQuery = db
    .collection("notifications")
    .where("user_id", "==", userId)
    .orderBy("created_at", "desc")
    .orderBy("__name__", "desc");
  const items: ServerNotificationRecord[] = [];
  let scanCursor = cursor ?? null;
  let exhausted = false;
  while (items.length <= limit && !exhausted) {
    let query = baseQuery;
    if (scanCursor) {
      query = query.startAfter(
        scanCursor.createdAt,
        db.collection("notifications").doc(scanCursor.id),
      );
    }
    const snap = await query.limit(limit * 2).get();
    for (const doc of snap.docs) {
      const item = { ...(doc.data() as ServerNotificationRecord), id: doc.id };
      scanCursor = { createdAt: item.created_at, id: item.id };
      // New messages own their unread state and badge in the Messages workspace.
      // Reactions and other activity relating to a chat still belong in Notifications.
      if (item.category !== "message") items.push(item);
      if (items.length > limit) break;
    }
    exhausted = snap.size < limit * 2 || snap.docs.length === 0;
    if (items.length > limit || exhausted) break;
  }
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  const last = page.at(-1);
  return {
    // Actor enrichment is cosmetic. A lookup issue must never make the whole
    // notification inbox fail to load.
    items: await hydrateLegacyActivity(page).catch((error) => {
      console.warn("[notifications] legacy actor enrichment failed", error);
      return page;
    }),
    hasMore,
    nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

/** Resolves @usernames in a text body to user ids via the usernames collection. */
export async function resolveMentionedUserIds(body: string, excludeUserId?: string) {
  const handles = [
    ...new Set(
      [...body.matchAll(/(?:^|[\s(])@([a-z0-9_]+(?:\.[a-z0-9_]+)*)/gi)]
        .map((mention) => mention[1]!.toLowerCase())
        .filter((handle) => handle.length >= 2 && handle.length <= 20),
    ),
  ];
  if (handles.length === 0) return [];
  const db = getFirestoreDb();
  const ids: string[] = [];
  for (const handle of handles.slice(0, 10)) {
    const snap = await db.collection("usernames").doc(handle).get();
    const userId = (snap.data() as { user_id?: string } | undefined)?.user_id;
    if (userId && userId !== excludeUserId && !ids.includes(userId)) ids.push(userId);
  }
  return ids;
}
