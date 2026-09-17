import { generateId } from "./firebase-data.server";
import { getFirestoreDb } from "./firebase.server";

export type ServerNotificationRecord = {
  id: string;
  user_id: string;
  kind: "success" | "error" | "info" | "warning";
  title: string;
  description: string | null;
  link: string | null;
  created_at: string;
};

/** Durable cross-device notification stored in Firestore. */
export async function pushServerNotification(input: {
  userId: string;
  kind: ServerNotificationRecord["kind"];
  title: string;
  description?: string | null;
  link?: string | null;
}) {
  const db = getFirestoreDb();
  const record: ServerNotificationRecord = {
    id: generateId(),
    user_id: input.userId,
    kind: input.kind,
    title: input.title.slice(0, 140),
    description: input.description?.slice(0, 300) ?? null,
    link: input.link ?? null,
    created_at: new Date().toISOString(),
  };
  await db.collection("notifications").doc(record.id).set(record);
  return record;
}

export async function listServerNotifications(userId: string, limit = 30) {
  const db = getFirestoreDb();
  const snap = await db.collection("notifications").where("user_id", "==", userId).get();
  return snap.docs
    .map((doc) => doc.data() as ServerNotificationRecord)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

/** Resolves @usernames in a text body to user ids via the usernames collection. */
export async function resolveMentionedUserIds(body: string, excludeUserId?: string) {
  const handles = [...new Set(
    (body.match(/@([a-z0-9_]{2,24})/gi) ?? []).map((m) => m.slice(1).toLowerCase()),
  )];
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
