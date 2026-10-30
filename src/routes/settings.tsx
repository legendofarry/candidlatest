import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import type { User } from "firebase/auth";
import { EmailAuthProvider, linkWithCredential } from "firebase/auth";
import {
  BellRing,
  ChevronRight,
  Fingerprint,
  Settings2,
  ShieldCheck,
  DatabaseZap,
  EyeOff,
  Gem,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PrivacySettings } from "@/components/site/privacy-settings";
import { AccountLifecycleSettings } from "@/components/site/account-lifecycle-settings";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notifications-store";
import { setPreference, usePreferences } from "@/lib/preferences";
import { clearPersistedQueries } from "@/lib/query-persist";
import { storageService } from "@/lib/storage";
import {
  clearCredentials,
  getCredentials,
  hasCredentialFor,
  isPlatformAuthenticatorAvailable,
  registerBiometric,
} from "@/lib/biometrics";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FloatingBackButton } from "@/components/site/floating-back-button";
import { firebaseAuth } from "@/integrations/firebase/client";
import { claimOfficialCandidAccount, getOnboardingState } from "@/lib/onboarding.functions";
import { ProfilePhotoPicker } from "@/components/site/profile-photo";
import { clearDevelopmentFirestore, RESET_CONFIRMATION } from "@/lib/developer.functions";
import {
  registerMyPushToken,
  sendMyPushTestNotification,
  unregisterMyPushToken,
} from "@/lib/push.functions";
import { firebaseApp, registerFirebaseServiceWorker } from "@/integrations/firebase/client";
import { hasPushOptIn, setPushOptIn } from "@/lib/push-preference";
import { getMyFeedPreferences, updateFeedPreference } from "@/lib/social.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Candid" },
      { name: "description", content: "Manage your Candid account, privacy and preferences." },
      { property: "og:title", content: "Settings | Candid" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const prefs = usePreferences();
  const queryClient = useQueryClient();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [developerResetOpen, setDeveloperResetOpen] = useState(false);
  const [notInterestedOpen, setNotInterestedOpen] = useState(false);
  const [developerResetText, setDeveloperResetText] = useState("");
  const [developerResetting, setDeveloperResetting] = useState(false);
  const [claimingCandid, setClaimingCandid] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );
  const [pushBusy, setPushBusy] = useState(false);
  const [pushTestBusy, setPushTestBusy] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const fetchProfile = useServerFn(getOnboardingState);
  const claimCandidAccount = useServerFn(claimOfficialCandidAccount);
  const resetFirestore = useServerFn(clearDevelopmentFirestore);
  const registerPush = useServerFn(registerMyPushToken);
  const unregisterPush = useServerFn(unregisterMyPushToken);
  const sendPushTest = useServerFn(sendMyPushTestNotification);
  const readFeedPreferences = useServerFn(getMyFeedPreferences);
  const changeFeedPreference = useServerFn(updateFeedPreference);
  const developerMode = import.meta.env.DEV || import.meta.env["VITE_DEVELOPER_MODE"] === "true";
  const profile = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => fetchProfile(),
    enabled: Boolean(user),
  });
  const feedPreferences = useQuery({
    queryKey: ["feed-preferences", user?.uid ?? null],
    queryFn: () => readFeedPreferences(),
    enabled: Boolean(user),
  });

  async function restoreFeedItem(item: NonNullable<typeof feedPreferences.data>[number]) {
    if (!user) return;
    try {
      const items = await changeFeedPreference({
        data: { kind: item.kind, target_id: item.target_id, hidden: false },
      });
      queryClient.setQueryData(["feed-preferences", user.uid], items);
      void queryClient.invalidateQueries({ queryKey: ["story-pages", user.uid] });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not restore this feed content.");
    }
  }

  useEffect(() => {
    void isPlatformAuthenticatorAvailable().then(setBioAvailable);
    setEnrolled(user ? hasCredentialFor(user.uid) : false);
  }, [user]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!user || typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
        if (active) {
          setPushAvailable(false);
          setPushEnabled(false);
          setPushPermission("unsupported");
        }
        return;
      }
      try {
        const messagingSdk = await import("firebase/messaging");
        const supported = await messagingSdk.isSupported().catch(() => false);
        if (!active) return;
        setPushAvailable(supported);
        setPushPermission(Notification.permission);
        if (!supported || Notification.permission !== "granted") {
          setPushEnabled(false);
          return;
        }
        if (!hasPushOptIn(Notification.permission)) {
          setPushEnabled(false);
          return;
        }
        const vapidKey = import.meta.env["VITE_FIREBASE_VAPID_KEY"];
        if (!vapidKey) return;
        const registration = await registerFirebaseServiceWorker();
        const messaging = messagingSdk.getMessaging(firebaseApp);
        const token = await messagingSdk.getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: registration,
        });
        if (!token || !active) return;
        setPushToken(token);
        setPushEnabled(true);
      } catch (error) {
        console.warn("[push settings] Could not restore this device", error);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  async function togglePushNotifications(next: boolean) {
    if (!user || pushBusy) return;
    setPushBusy(true);
    try {
      const vapidKey = import.meta.env["VITE_FIREBASE_VAPID_KEY"];
      if (!vapidKey)
        throw new Error("Push notifications are not configured for this Candid site yet.");
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const installed =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (next && ios && !installed)
        throw new Error(
          "On iPhone or iPad, add Candid to your Home Screen before enabling notifications.",
        );

      if (next) {
        if (typeof Notification === "undefined")
          throw new Error("This browser does not support notifications.");
        let permission = Notification.permission;
        // Ask before any async setup so the browser still recognizes the user's click.
        if (permission === "default") permission = await Notification.requestPermission();
        setPushPermission(permission);
        if (permission !== "granted") {
          throw new Error(
            permission === "denied"
              ? "Notifications are blocked by your browser. Allow them in the browser's site settings."
              : "Allow notifications to enable Candid alerts.",
          );
        }
      }

      const messagingSdk = await import("firebase/messaging");
      if (!(await messagingSdk.isSupported()))
        throw new Error("This browser does not support web push notifications.");
      const messaging = messagingSdk.getMessaging(firebaseApp);
      if (!next) {
        const registration = await registerFirebaseServiceWorker();
        const token =
          pushToken ||
          (await messagingSdk.getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: registration,
          }));
        if (token) await unregisterPush({ data: { token } });
        await messagingSdk.deleteToken(messaging);
        setPushOptIn(false);
        setPushToken(null);
        setPushEnabled(false);
        return;
      }
      const registration = await registerFirebaseServiceWorker();
      const token = await messagingSdk.getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });
      if (!token) throw new Error("This device did not return a notification token. Try again.");
      await registerPush({ data: { token } });
      setPushOptIn(true);
      setPushToken(token);
      setPushEnabled(true);
      notify.success("Notifications are enabled on this device.");
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
      if (code === "messaging/token-subscribe-failed") {
        notify.error("Firebase could not register this device", {
          description:
            "Check that FCM Registration API is enabled and that this deployment’s Firebase web config and VAPID key all belong to the same Firebase project.",
        });
      } else {
        notify.error(
          error instanceof Error ? error.message : "Could not update notification settings.",
        );
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function sendPushTestNotification() {
    if (pushTestBusy) return;
    setPushTestBusy(true);
    try {
      const result = await sendPushTest();
      if (result.sent > 0) {
        notify.success("Test notification sent", {
          description: `Sent to ${result.sent} of ${result.registered} registered device${result.registered === 1 ? "" : "s"}.`,
        });
      } else if (result.registered === 0) {
        notify.error("No push-enabled devices found", {
          description: "Turn on push notifications for this browser or installed app first.",
        });
      } else {
        notify.error("Candid could not deliver the test notification", {
          description: "Check the Firebase Cloud Messaging setup, then try again.",
        });
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not send a test notification.");
    } finally {
      setPushTestBusy(false);
    }
  }

  const iosDevice =
    typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installedWebApp =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const pushDescription = pushBusy
    ? "Updating notification settings on this device…"
    : !user
      ? "Sign in to enable push alerts."
      : !pushAvailable || pushPermission === "unsupported"
        ? "This browser or device does not support web push notifications."
        : !import.meta.env["VITE_FIREBASE_VAPID_KEY"]
          ? "Push notifications are not configured for this site yet."
          : pushPermission === "denied"
            ? "Notifications are blocked. Allow them in your browser or device settings, then reload Candid."
            : pushEnabled
              ? "Enabled for this browser or installed app. Background alerts appear as system notifications; while Candid is open, they appear in Candid."
              : iosDevice && !installedWebApp
                ? "Off. On iPhone or iPad, first add Candid to your Home Screen, then enable alerts from the installed app."
                : "Off. Turn this on to receive message and account alerts. Installing is optional on desktop and Android.";

  async function toggleBiometric(next: boolean) {
    if (!user) return;
    if (!next) {
      clearCredentials();
      setEnrolled(false);
      setPreference("biometricUnlock", false);
      return;
    }
    try {
      await registerBiometric(user.uid, user.email ?? "Candid user");
      setEnrolled(true);
      setPreference("biometricUnlock", true);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not enable biometric unlock");
    }
  }

  async function clearDevelopmentDatabase() {
    if (developerResetting || developerResetText !== RESET_CONFIRMATION) return;
    setDeveloperResetting(true);
    try {
      await resetFirestore({ data: { confirmation: RESET_CONFIRMATION } });
      clearPersistedQueries();
      storageService.clearCache();
      queryClient.clear();
      setDeveloperResetOpen(false);
      setDeveloperResetText("");
      await firebaseAuth.signOut();
      await navigate({ to: "/auth" });
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not clear the development database.",
      );
    } finally {
      setDeveloperResetting(false);
    }
  }

  const notInterestedContent = (
    <>
      <p className="px-4 pt-4 text-sm text-muted-foreground">
        Posts you hide and accounts or employers you mute can be restored here.
      </p>
      {feedPreferences.isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading preferences…</p>
      ) : feedPreferences.data?.length ? (
        <ul className="divide-y divide-border/70">
          {feedPreferences.data.map((item) => (
            <li
              key={`${item.kind}:${item.target_id}`}
              className="flex items-center gap-3 px-4 py-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <EyeOff className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {item.kind === "story"
                    ? "Hidden post"
                    : item.kind === "author"
                      ? "Muted account"
                      : "Muted employer"}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void restoreFeedItem(item)}
              >
                <RotateCcw className="size-4" /> Show again
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">
          You have no hidden posts or muted accounts and employers.
        </p>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background md:h-dvh md:overflow-hidden">
      <FloatingBackButton onClick={() => navigate({ to: "/" })} className="hidden md:inline-flex" />
      <div className="grid min-h-screen md:h-dvh md:min-h-0 md:grid-cols-[minmax(280px,0.86fr)_1.14fr]">
        <section className="relative hidden min-h-screen overflow-hidden bg-[#132523] px-7 py-16 text-white md:flex md:h-dvh md:items-center lg:px-12 lg:py-24">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,#182c28_0%,#17212c_55%,#29271d_100%)]" />
          <div className="absolute inset-0 opacity-20" aria-hidden>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_15%,#65c5a1,transparent_40%),radial-gradient(ellipse_at_85%_90%,#e2ac63,transparent_42%)]" />
          </div>
          <div className="relative mx-auto w-full max-w-lg">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
              <Settings2 className="size-4" /> Your space, your rules
            </div>
            <h1 className="mt-5 max-w-md text-4xl font-semibold leading-tight">
              Set Candid up the way you work.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/70">
              Your privacy, appearance, notifications and account access live here.
            </p>
            <div className="relative mt-14 h-64 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-sm">
              <motion.div
                className="absolute left-8 right-8 top-8 rounded-xl border border-white/15 bg-[#16211f] p-4"
                animate={{ y: [0, -8, 0], rotate: [0, -1, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-300/15 text-emerald-200">
                    <ShieldCheck className="size-5" />
                  </span>
                  <div className="flex-1">
                    <div className="h-2 w-28 rounded-full bg-white/75" />
                    <div className="mt-2 h-1.5 w-40 rounded-full bg-white/25" />
                  </div>
                  <span className="h-5 w-9 rounded-full bg-emerald-400/80 p-1">
                    <span className="ml-auto block size-3 rounded-full bg-white" />
                  </span>
                </div>
              </motion.div>
              <motion.div
                className="absolute bottom-7 left-12 right-12 rounded-xl border border-white/15 bg-[#202425] p-4"
                animate={{ y: [0, 7, 0] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-amber-300/15 text-amber-200">
                    <Fingerprint className="size-5" />
                  </span>
                  <div className="flex-1">
                    <div className="h-2 w-24 rounded-full bg-white/75" />
                    <div className="mt-2 h-1.5 w-32 rounded-full bg-white/25" />
                  </div>
                  <div className="flex gap-1">
                    <i className="size-1.5 rounded-full bg-white/50" />
                    <i className="size-1.5 rounded-full bg-white/50" />
                    <i className="size-1.5 rounded-full bg-white/50" />
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="min-h-screen overflow-y-auto px-5 pb-12 pt-2 sm:px-10 md:h-dvh md:min-h-0 md:px-8 md:pt-16 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="mx-auto max-w-5xl space-y-4 md:space-y-8"
          >
            <header>
              <div className="flex items-start justify-between gap-4">
                {user ? (
                  <Link
                    to="/billing"
                    aria-label="Membership"
                    title="Membership"
                    className="hidden size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary transition-colors hover:bg-primary/10 md:inline-flex"
                  >
                    <Gem className="size-5" />
                  </Link>
                ) : null}
              </div>
            </header>

            {user ? (
              <SettingsGroup title="Your profile">
                <div className="p-4">
                  <ProfilePhotoPicker
                    compact
                    photoUrl={profile.data?.photoUrl}
                    initials={(profile.data?.username?.[0] ?? user.email?.[0] ?? "U").toUpperCase()}
                    onSaved={(photoUrl) => {
                      queryClient.setQueryData(
                        ["onboarding-state", user.uid],
                        (previous: unknown) =>
                          previous && typeof previous === "object"
                            ? { ...previous, photoUrl }
                            : previous,
                      );
                    }}
                  />
                </div>
              </SettingsGroup>
            ) : null}

            {user?.email?.trim().toLowerCase() === "karimiarrison@gmail.com" &&
              profile.data?.accountType !== "official" ? (
              <SettingsGroup title="Official Candid account">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">Use this login for @candid</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This verified account will become Candid’s official profile.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 rounded-xl"
                    disabled={claimingCandid}
                    onClick={() => {
                      setClaimingCandid(true);
                      void claimCandidAccount({ data: undefined })
                        .then(async () => {
                          await queryClient.invalidateQueries({
                            queryKey: ["onboarding-state", user.uid],
                          });
                          notify.success("This login is now the official @candid account.");
                        })
                        .catch((error: unknown) => {
                          notify.error(
                            error instanceof Error
                              ? error.message
                              : "Could not link the official Candid account.",
                          );
                        })
                        .finally(() => setClaimingCandid(false));
                    }}
                  >
                    {claimingCandid ? "Linking account…" : "Make this @candid"}
                  </Button>
                </div>
              </SettingsGroup>
            ) : null}

            <div className="grid gap-8 lg:grid-cols-[10rem_minmax(0,1fr)]">
              <nav aria-label="Settings sections" className="hidden lg:block">
                <div className="sticky top-8 space-y-1 border-l border-border pl-3">
                  <a
                    href="#security"
                    className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Security
                  </a>
                  <a
                    href="#advanced"
                    className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Advanced
                  </a>
                  <a
                    href="#privacy"
                    className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Privacy
                  </a>
                </div>
              </nav>
              <div className="space-y-8">
                <div id="security">
                  <SettingsGroup title="Notifications">
                    <ToggleRow
                      icon={<BellRing className="size-4" />}
                      title="Push notifications on this device"
                      description={pushDescription}
                      checked={pushEnabled}
                      disabled={
                        !user ||
                        !pushAvailable ||
                        pushBusy ||
                        pushPermission === "denied" ||
                        pushPermission === "unsupported" ||
                        !import.meta.env["VITE_FIREBASE_VAPID_KEY"]
                      }
                      onCheckedChange={(next) => void togglePushNotifications(next)}
                    />
                    {pushEnabled ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">Check push delivery</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            Send a sample alert to your push-enabled browsers and installed apps.
                            Keep another device in the background to check its system alert.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pushTestBusy}
                          onClick={() => void sendPushTestNotification()}
                        >
                          {pushTestBusy ? "Sending…" : "Send test"}
                        </Button>
                      </div>
                    ) : null}
                  </SettingsGroup>
                  <div className="mt-4">
                    <SettingsGroup title="Security & access">
                      <ToggleRow
                        icon={<Fingerprint className="size-4" />}
                        title="Fingerprint / face unlock"
                        description={
                          !user
                            ? "Sign in first to set up biometric unlock."
                            : bioAvailable
                              ? "Unlock Candid on this device without typing your password."
                              : "This device has no browser supported biometric sensor."
                        }
                        checked={prefs.biometricUnlock && enrolled}
                        disabled={!user || !bioAvailable}
                        onCheckedChange={(next) => void toggleBiometric(next)}
                      />
                      {enrolled ? (
                        <p className="px-4 pb-3 text-xs text-muted-foreground">
                          Registered: {getCredentials()[0]?.label}
                        </p>
                      ) : null}
                    </SettingsGroup>
                  </div>
                  <div className="mt-4">
                    <SignInMethods user={user} />
                  </div>
                </div>

                <div id="advanced">
                  <SettingsGroup title="Advanced">
                    <Accordion type="single" collapsible className="w-full px-0">
                      <AccordionItem value="advanced-actions" className="border-b-0">
                        <AccordionTrigger className="px-4 py-3 text-left text-sm font-medium text-foreground hover:no-underline">
                          Account actions
                        </AccordionTrigger>
                        <AccordionContent className="px-0 pb-0">
                          <div className="px-4 pb-4 pt-2">
                            <AccountLifecycleSettings />
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </SettingsGroup>
                </div>

                <div id="privacy">
                  <div className="mb-4">
                    <div className="md:hidden">
                      <button
                        type="button"
                        onClick={() => setNotInterestedOpen(true)}
                        className="flex w-full items-center gap-3 border-y border-border py-4 text-left"
                      >
                        <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                          <EyeOff className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">Not interested</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Restore hidden posts and muted accounts
                          </span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </button>
                      <Drawer open={notInterestedOpen} onOpenChange={setNotInterestedOpen}>
                        <DrawerContent className="h-[85dvh] max-h-[85dvh] rounded-t-3xl md:hidden">
                          <DrawerHeader className="shrink-0 text-left">
                            <DrawerTitle>Not interested</DrawerTitle>
                            <DrawerDescription>
                              Restore posts, accounts or employers you hid.
                            </DrawerDescription>
                          </DrawerHeader>
                          <div className="min-h-0 flex-1 overflow-y-auto pb-[max(2rem,env(safe-area-inset-bottom))]">
                            {notInterestedContent}
                          </div>
                        </DrawerContent>
                      </Drawer>
                    </div>
                    <div className="hidden md:block">
                      <SettingsGroup title="Not interested">{notInterestedContent}</SettingsGroup>
                    </div>
                  </div>
                  <PrivacySettings />
                </div>

                {developerMode ? (
                  <div id="developer-tools">
                    <SettingsGroup title="Developer tools">
                      <ActionRow
                        icon={<DatabaseZap className="size-4" />}
                        title="Clear Firestore development data"
                        description="Deletes every Firestore document, including profiles, stories and messages. Firebase Authentication accounts and uploaded files are not deleted."
                        actionLabel="Clear database"
                        destructive
                        onClick={() => setDeveloperResetOpen(true)}
                      />
                    </SettingsGroup>
                  </div>
                ) : null}

                <Button asChild variant="outline" className="w-full">
                  <Link to="/profile">View profile</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </section>
      </div>
      <AlertDialog
        open={developerResetOpen}
        onOpenChange={(open) => {
          setDeveloperResetOpen(open);
          if (!open && !developerResetting) setDeveloperResetText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all Firestore development data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes every Firestore document. Firebase Authentication accounts
              and Cloudinary uploads are not included. Type <strong>{RESET_CONFIRMATION}</strong> to
              continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={developerResetText}
            onChange={(event) => setDeveloperResetText(event.target.value)}
            placeholder={RESET_CONFIRMATION}
            autoComplete="off"
            disabled={developerResetting}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={developerResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={developerResetText !== RESET_CONFIRMATION || developerResetting}
              onClick={(event) => {
                event.preventDefault();
                void clearDevelopmentDatabase();
              }}
            >
              {developerResetting ? "Clearing…" : "Clear Firestore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SignInMethods({ user }: { user: User | null }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordLinked, setPasswordLinked] = useState(() =>
    Boolean(
      user?.providerData.some((provider) => provider.providerId === EmailAuthProvider.PROVIDER_ID),
    ),
  );
  const accountEmail = user?.email ?? null;

  useEffect(() => {
    setPasswordLinked(
      Boolean(
        user?.providerData.some(
          (provider) => provider.providerId === EmailAuthProvider.PROVIDER_ID,
        ),
      ),
    );
  }, [user]);

  // Keep the password setup available to legacy accounts without a password;
  // accounts already using email/password do not need a redundant settings panel.
  if (!user || passwordLinked) return null;

  async function addPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !accountEmail || password.length < 8) return;
    setBusy(true);
    try {
      const credential = EmailAuthProvider.credential(accountEmail, password);
      const result = await linkWithCredential(user, credential);
      if (
        !result.user.providerData.some((item) => item.providerId === EmailAuthProvider.PROVIDER_ID)
      ) {
        throw new Error("Could not enable email and password sign-in for this account.");
      }
      setPasswordLinked(true);
      setPassword("");
    } catch (error) {
      notify.error(signInMethodError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsGroup title="Sign-in methods">
      {!user ? (
        <p className="p-4 text-sm text-muted-foreground">
          Sign in to manage email and password access.
        </p>
      ) : (
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Add a password to sign in with your email address.
          </p>
          <div>
            <p className="text-sm font-medium">Email and password</p>
            {passwordLinked ? (
              <p className="mt-1 text-xs text-muted-foreground">Connected to this account</p>
            ) : accountEmail ? (
              <form onSubmit={addPassword} className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a password (8+ characters)"
                  aria-label="Create a password"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button type="submit" variant="outline" size="sm" disabled={busy}>
                  Add password
                </Button>
              </form>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                This account has no email address. Contact Candid support to update it before
                setting a password.
              </p>
            )}
          </div>
        </div>
      )}
    </SettingsGroup>
  );
}

function signInMethodErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function signInMethodError(error: unknown) {
  const code = signInMethodErrorCode(error);
  if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
    return "That sign-in method belongs to another Candid account. Sign in to the account you want to keep; accounts are not merged automatically.";
  }
  if (code === "auth/provider-already-linked") return "This sign-in method is already connected.";
  if (code === "auth/requires-recent-login") {
    return "For security, sign out and sign back in before changing sign-in methods.";
  }
  return error instanceof Error ? error.message : "Could not update sign-in methods.";
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border border-y border-border bg-transparent md:overflow-hidden md:rounded-lg md:border md:bg-card">
        {children}
      </div>
    </section>
  );
}

function Row({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  checked,
  onCheckedChange,
  disabled,
  ...row
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
      )}
      disabled={disabled}
      aria-pressed={checked}
      onClick={() => onCheckedChange(!checked)}
    >
      <Row {...row}>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </Row>
    </button>
  );
}

function ActionRow({
  actionLabel,
  onClick,
  destructive,
  ...row
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <Row {...row}>
      <Button
        size="sm"
        variant="outline"
        className={cn(destructive && "text-destructive")}
        onClick={onClick}
      >
        {actionLabel}
      </Button>
    </Row>
  );
}
