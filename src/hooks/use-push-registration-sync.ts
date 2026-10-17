import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { requiresEmailVerification } from "@/lib/email-verification";
import { registerMyPushToken } from "@/lib/push.functions";
import { firebaseApp, registerFirebaseServiceWorker } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notifications-store";
import { hasPushOptIn } from "@/lib/push-preference";

/** Reassociates an already-authorized browser token with the signed-in account. */
export function usePushRegistrationSync() {
  const { user } = useAuth();
  const registerPush = useServerFn(registerMyPushToken);

  useEffect(() => {
    let active = true;
    let stopListening: (() => void) | undefined;
    void (async () => {
      if (
        !user || requiresEmailVerification(user) ||
        typeof window === "undefined" || typeof Notification === "undefined" ||
        Notification.permission !== "granted" || !hasPushOptIn(Notification.permission) ||
        !("serviceWorker" in navigator)
      ) return;

      const vapidKey = import.meta.env["VITE_FIREBASE_VAPID_KEY"];
      if (!vapidKey) return;

      try {
        const messagingSdk = await import("firebase/messaging");
        if (!await messagingSdk.isSupported()) return;
        const registration = await registerFirebaseServiceWorker();
        if (!active) return;
        const messaging = messagingSdk.getMessaging(firebaseApp);
        stopListening = messagingSdk.onMessage(messaging, (payload) => {
          if (!active || document.visibilityState !== "visible") return;
          const title = payload.notification?.title || "Candid";
          const body = payload.notification?.body || "You have a new notification.";
          notify.info(title, { description: body, duration: 7000 });
        });
        const token = await messagingSdk.getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: registration,
        });
        if (active && token) await registerPush({ data: { token } });
      } catch (error) {
        console.warn("[push] Could not sync this device to the signed-in account", error);
      }
    })();

    return () => {
      active = false;
      stopListening?.();
    };
  }, [user, registerPush]);
}
