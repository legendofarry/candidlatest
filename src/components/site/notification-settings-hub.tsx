import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Check, Loader2, Send, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { registerFirebaseServiceWorker, firebaseApp } from "@/integrations/firebase/client";
import { getPushToken, hasPushOptIn, setPushOptIn, setPushToken } from "@/lib/push-preference";
import {
  registerMyPushToken,
  sendMyPushTestNotification,
  unregisterMyPushToken,
} from "@/lib/push.functions";
import { notify } from "@/lib/notifications-store";

type PermissionState = NotificationPermission | "unsupported";

function permissionMessage(permission: PermissionState) {
  if (permission === "granted") return "Allowed by your browser";
  if (permission === "denied") return "Blocked by your browser";
  if (permission === "default") return "Not enabled yet";
  return "Not supported in this browser";
}

export function NotificationSettingsHub({ className }: { className?: string }) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<PermissionState>("unsupported");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const registerPush = useServerFn(registerMyPushToken);
  const unregisterPush = useServerFn(unregisterMyPushToken);
  const sendTestPush = useServerFn(sendMyPushTestNotification);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    setPermission(Notification.permission);
    setEnabled(Notification.permission === "granted" && hasPushOptIn(Notification.permission));
  }, [open]);

  async function togglePush(next: boolean) {
    if (!user || busy) return;
    setBusy(true);
    try {
      if (next) {
        if (typeof window === "undefined" || typeof Notification === "undefined") {
          throw new Error("This browser does not support push notifications.");
        }
        if (!("serviceWorker" in navigator)) {
          throw new Error("This browser does not support background notifications.");
        }

        const messagingSdk = await import("firebase/messaging");
        if (!(await messagingSdk.isSupported())) {
          throw new Error("Push notifications are not supported on this device.");
        }
        const vapidKey = import.meta.env["VITE_FIREBASE_VAPID_KEY"];
        if (!vapidKey) throw new Error("Push notifications are not configured for this app.");

        const permissionResult =
          Notification.permission === "default"
            ? await Notification.requestPermission()
            : Notification.permission;
        setPermission(permissionResult);
        if (permissionResult !== "granted") {
          throw new Error(
            permissionResult === "denied"
              ? "Notifications are blocked. Allow them in your browser or device settings, then try again."
              : "Notification permission was not granted.",
          );
        }

        const registration = await registerFirebaseServiceWorker();
        const messaging = messagingSdk.getMessaging(firebaseApp);
        const token = await messagingSdk.getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: registration,
        });
        if (!token) throw new Error("Could not register this device for notifications.");
        await registerPush({ data: { token } });
        setPushToken(token);
        setPushOptIn(true);
        setEnabled(true);
        notify.success("Push notifications enabled on this device.");
      } else {
        let token = getPushToken();
        let messagingSdk: typeof import("firebase/messaging") | null = null;
        if (
          !token &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          "serviceWorker" in navigator
        ) {
          messagingSdk = await import("firebase/messaging");
          if (await messagingSdk.isSupported()) {
            const vapidKey = import.meta.env["VITE_FIREBASE_VAPID_KEY"];
            if (vapidKey) {
              const registration = await registerFirebaseServiceWorker();
              token = await messagingSdk.getToken(messagingSdk.getMessaging(firebaseApp), {
                vapidKey,
                serviceWorkerRegistration: registration,
              });
            }
          }
        }
        if (token) await unregisterPush({ data: { token } });
        setPushOptIn(false);
        setPushToken(null);
        setEnabled(false);

        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            const sdk = messagingSdk ?? (await import("firebase/messaging"));
            if (await sdk.isSupported()) {
              const messaging = sdk.getMessaging(firebaseApp);
              await sdk.deleteToken(messaging);
            }
          } catch (error) {
            console.warn("[push] Could not remove this device's browser token", error);
          }
        }
        notify.success("Push notifications turned off on this device.");
      }
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not update notification settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    if (!user || testing) return;
    setTesting(true);
    try {
      const result = await sendTestPush();
      if (result.sent > 0) {
        notify.success("Test notification sent.", {
          description: `Delivered to ${result.sent} of ${result.registered} registered device(s).`,
        });
      } else {
        notify.error("No registered devices received the test.", {
          description: "Enable push notifications on this device and try again.",
        });
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not send a test notification.");
    } finally {
      setTesting(false);
    }
  }

  const content = (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
      <section>
        <div className="mb-3">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">On this device</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose whether Candid can send alerts to this browser or app.
          </p>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-3 px-3.5 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
              {enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Push notifications</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                {permissionMessage(permission)}
              </span>
            </span>
            <Switch
              checked={enabled}
              disabled={!user || busy || permission === "unsupported"}
              onCheckedChange={(checked) => void togglePush(checked)}
              aria-label="Push notifications on this device"
            />
          </div>
          {permission === "denied" ? (
            <p className="px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
              Your browser has blocked notifications. Change the permission in your browser or
              device settings before enabling them here.
            </p>
          ) : null}
          <div className="flex items-center gap-3 px-3.5 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
              <Check className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Notifications inbox</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                Your Candid inbox stays on, even when push alerts are off.
              </span>
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              Always on
            </span>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">Try it out</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Send a test alert to your registered devices.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center rounded-xl"
          disabled={!user || !enabled || testing}
          onClick={() => void runTest()}
        >
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {testing ? "Sending test…" : "Send test notification"}
        </Button>
      </section>

      {!user ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sign in to manage push notifications for your account.
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Notification settings"
        title="Notification settings"
        className={className ?? "!size-10 rounded-full border-2 sm:!size-12"}
        onClick={() => setOpen(true)}
      >
        <Settings2 className="size-4" />
      </Button>
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent
            overlayClassName="z-[110]"
            className="!z-[110] flex h-[min(80dvh,38rem)] max-h-[90dvh] flex-col overflow-hidden rounded-t-[1.25rem] bg-background"
          >
            <DrawerTitle className="sr-only">Notification settings</DrawerTitle>
            <DrawerDescription className="sr-only">
              Manage push alerts on this device and send a test notification.
            </DrawerDescription>
            <div className="shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-6">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Notification settings
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Manage how Candid reaches you.</p>
            </div>
            {content}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            hideCloseButton
            className="flex max-h-[min(80dvh,38rem)] w-[min(30rem,94vw)] flex-col gap-0 overflow-hidden rounded-2xl bg-background p-0"
          >
            <DialogTitle className="sr-only">Notification settings</DialogTitle>
            <DialogDescription className="sr-only">
              Manage push alerts on this device and send a test notification.
            </DialogDescription>
            <div className="shrink-0 border-b border-border px-5 pb-3 pt-5">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Notification settings
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Manage how Candid reaches you.</p>
            </div>
            {content}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
