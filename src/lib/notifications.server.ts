import { generateId } from "./firebase-data.server";
import { getFirestoreDb } from "./firebase.server";

export type ServerNotificationRecord = {
  id: string;
  user_id: string;
  category?: "activity" | "message";
  kind: "success" | "error" | "info" | "warning";
  title: string;
  description: string | null;
  link: string | null;
  created_at: string;
};

/** Durable cross-device notification stored in Firestore. */
export async function pushServerNotification(input: {
  id?: string;
  userId: string;
  category?: ServerNotificationRecord["category"];
  kind: ServerNotificationRecord["kind"];
  title: string;
  description?: string | null;
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
    items: page,
    hasMore,
    nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

/** Resolves @usernames in a text body to user ids via the usernames collection. */
export async function resolveMentionedUserIds(body: string, excludeUserId?: string) {
  const handles = [
    ...new Set((body.match(/@([a-z0-9_]{2,24})/gi) ?? []).map((m) => m.slice(1).toLowerCase())),
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
