import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { requiresEmailVerification } from "@/lib/email-verification";
import { registerMyPushToken } from "@/lib/push.functions";
import { firebaseApp, registerFirebaseServiceWorker } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/useAuth";

/** Reassociates an already-authorized browser token with the signed-in account. */
export function usePushRegistrationSync() {
  const { user } = useAuth();
  const registerPush = useServerFn(registerMyPushToken);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (
        !user || requiresEmailVerification(user) ||
        typeof window === "undefined" || typeof Notification === "undefined" ||
        Notification.permission !== "granted" || !("serviceWorker" in navigator)
      ) return;

      const vapidKey = import.meta.env["VITE_FIREBASE_VAPID_KEY"];
      if (!vapidKey) return;

      try {
        const messagingSdk = await import("firebase/messaging");
        if (!await messagingSdk.isSupported()) return;
        const registration = await registerFirebaseServiceWorker();
        const messaging = messagingSdk.getMessaging(firebaseApp);
        const token = await messagingSdk.getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: registration,
        });
        if (active && token) await registerPush({ data: { token } });
      } catch (error) {
        console.warn("[push] Could not sync this device to the signed-in account", error);
      }
    })();

    return () => { active = false; };
  }, [user, registerPush]);
}
