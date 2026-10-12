importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

const fallbackFirebaseConfig = {
  apiKey: "AIzaSyBHbdPGXQddWpgbwAm6_w1kxlg22XCCyf8",
  authDomain: "candid-431db.firebaseapp.com",
  projectId: "candid-431db",
  messagingSenderId: "684808500794",
  appId: "1:684808500794:web:0f6bd196f828164fd3a703",
};
let firebaseConfig = fallbackFirebaseConfig;
try {
  const configParam = new URL(self.location.href).searchParams.get("firebaseConfig");
  if (configParam) firebaseConfig = { ...fallbackFirebaseConfig, ...JSON.parse(configParam) };
} catch { /* Retain the app's default Firebase project config. */ }
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const target = payload.data?.url || payload.notification?.click_action || "/notifications";
  const url = new URL(target, self.location.origin);
  if (url.origin !== self.location.origin) url.href = new URL("/notifications", self.location.origin).href;
  void self.registration.showNotification(payload.notification?.title || "Candid", {
    body: payload.notification?.body || "You have a new notification.",
    icon: payload.notification?.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.notification?.tag || "candid-notification",
    data: { url: url.href },
  });
});

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

// Keep the installed app connected to the same live data and auth behavior as
// the website. Private pages and API responses are never cached offline.
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") {
    event.respondWith(fetch(event.request));
  }
});
