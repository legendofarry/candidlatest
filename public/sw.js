// Register click behavior before loading Firebase Messaging. FCM can install
// its own notificationclick handler when the library initializes.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin);
  if (target.origin !== self.location.origin) target.href = new URL("/notifications", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target.href);
        return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

const configParam = new URL(self.location.href).searchParams.get("firebaseConfig");
if (!configParam) throw new Error("Missing Firebase configuration for the service worker.");
const firebaseConfig = JSON.parse(configParam);
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const target = payload.data?.url || payload.notification?.click_action || "/notifications";
  const url = new URL(target, self.location.origin);
  if (url.origin !== self.location.origin) url.href = new URL("/notifications", self.location.origin).href;
  return self.registration.showNotification(payload.notification?.title || payload.data?.title || "Candid", {
    body: payload.notification?.body || payload.data?.body || "You have a new notification.",
    icon: payload.notification?.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.notification?.tag || payload.data?.notificationId || "candid-notification",
    data: { url: url.href },
  });
});
