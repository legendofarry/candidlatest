import { createHash } from "node:crypto";
import { getFirebaseMessagingCredentials, getFirestoreDb } from "./firebase.server";

type PushMessage = { title: string; body?: string | null; link?: string | null; notificationId?: string };

const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

export async function registerPushToken(userId: string, token: string, userAgent: string | null) {
  const db = getFirestoreDb();
  const id = tokenId(token);
  await db.collection("push_tokens").doc(id).set({
    id,
    user_id: userId,
    token,
    user_agent: userAgent?.slice(0, 300) ?? null,
    updated_at: new Date().toISOString(),
  }, { merge: true });
  return { registered: true as const };
}

export async function removePushToken(userId: string, token: string) {
  const db = getFirestoreDb();
  const ref = db.collection("push_tokens").doc(tokenId(token));
  const snapshot = await ref.get();
  if (snapshot.exists && snapshot.get("user_id") === userId) await ref.delete();
  return { removed: true as const };
}

/** Pushes a privacy-safe alert; full notification details stay inside the signed-in app. */
export async function dispatchWebPush(userId: string, input: PushMessage) {
  try {
    const db = getFirestoreDb();
    const subscriptions = await db.collection("push_tokens").where("user_id", "==", userId).get();
    if (!subscriptions.size) return { sent: 0 };
    const { accessToken, projectId } = await getFirebaseMessagingCredentials();
    const siteUrl = process.env["PUBLIC_APP_URL"] || "https://candid-beta.netlify.app";
    const relativeLink = input.link || "/notifications";
    const link = new URL(relativeLink, siteUrl).toString();
    let sent = 0;
    await Promise.all(subscriptions.docs.map(async (subscription) => {
      const token = String(subscription.get("token") || "");
      if (!token) return;
      try {
        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              webpush: {
                headers: { Urgency: "high" },
                notification: {
                  title: "Candid",
                  body: "You have a new notification.",
                  icon: "/icons/icon-192.png",
                  tag: input.notificationId || "candid-notification",
                  renotify: false,
                  data: { url: link },
                },
                fcm_options: { link },
              },
            },
          }),
        });
        if (response.ok) {
          sent += 1;
          return;
        }
        const body = await response.json().catch(() => ({})) as { error?: { details?: Array<{ errorCode?: string }>; status?: string } };
        const status = body.error?.status;
        const errorCode = body.error?.details?.some((detail) => detail.errorCode === "UNREGISTERED");
        if (status === "UNREGISTERED" || errorCode) await subscription.ref.delete();
        else console.warn("[web push] FCM delivery failed", response.status, status || "unknown");
      } catch (error) {
        console.warn("[web push] Could not deliver notification", error instanceof Error ? error.message : "unknown error");
      }
    }));
    return { sent };
  } catch (error) {
    // Push delivery is best-effort; the durable notification remains in the inbox.
    console.warn("[web push] Notification dispatch failed", error instanceof Error ? error.message : "unknown error");
    return { sent: 0 };
  }
}
