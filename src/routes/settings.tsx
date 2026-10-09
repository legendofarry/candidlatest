import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import type { User } from "firebase/auth";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
} from "firebase/auth";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Fingerprint,
  Gauge,
  Headset,
  Moon,
  RefreshCw,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  DatabaseZap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PrivacySettings } from "@/components/site/privacy-settings";
import { useAuth } from "@/hooks/useAuth";
import { inbox, notify, openNotifications } from "@/lib/notifications-store";
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
import { FloatingBackButton } from "@/components/site/floating-back-button";
import { firebaseAuth } from "@/integrations/firebase/client";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { ProfilePhotoPicker } from "@/components/site/profile-photo";
import { clearDevelopmentFirestore, RESET_CONFIRMATION } from "@/lib/developer.functions";
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
  const [developerResetText, setDeveloperResetText] = useState("");
  const [developerResetting, setDeveloperResetting] = useState(false);
  const fetchProfile = useServerFn(getOnboardingState);
  const resetFirestore = useServerFn(clearDevelopmentFirestore);
  const developerMode = import.meta.env.DEV || import.meta.env["VITE_DEVELOPER_MODE"] === "true";
  const profile = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => fetchProfile(),
    enabled: Boolean(user),
  });

  useEffect(() => {
    void isPlatformAuthenticatorAvailable().then(setBioAvailable);
    setEnrolled(user ? hasCredentialFor(user.uid) : false);
  }, [user]);

  async function toggleBiometric(next: boolean) {
    if (!user) return;
    if (!next) {
      clearCredentials();
      setEnrolled(false);
      setPreference("biometricUnlock", false);
      notify.info("Fast unlock turned off");
      return;
    }
    try {
      await registerBiometric(user.uid, user.email ?? "Candid user");
      setEnrolled(true);
      setPreference("biometricUnlock", true);
      inbox.success("Fingerprint / face unlock enabled on this device", {
        description: "You can turn it off any time from settings.",
        dedupeKey: "biometric-enabled",
      });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not enable biometric unlock");
    }
  }

  async function clearDevelopmentDatabase() {
    if (developerResetting || developerResetText !== RESET_CONFIRMATION) return;
    setDeveloperResetting(true);
    try {
      const result = await resetFirestore({ data: { confirmation: RESET_CONFIRMATION } });
      clearPersistedQueries();
      storageService.clearCache();
      queryClient.clear();
      setDeveloperResetOpen(false);
      setDeveloperResetText("");
      notify.success(
        `Cleared ${result.deleted.toLocaleString()} Firestore document${result.deleted === 1 ? "" : "s"}.`,
      );
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

        <section className="min-h-screen overflow-y-auto px-5 pb-12 pt-5 sm:px-10 md:h-dvh md:min-h-0 md:px-8 md:pt-16 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="mx-auto max-w-5xl space-y-8"
          >
            <header>
              <p className="text-sm font-medium text-primary">Candid account</p>
              <h2 className="mt-1 text-3xl font-semibold">Settings</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Manage your preferences and account controls.
              </p>
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

            {user ? (
              <SettingsGroup title="Membership">
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{profile.data?.membership?.tier === "gold" ? "Gold" : profile.data?.membership?.tier === "premium" ? "Premium" : "Basic"} plan</p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0 rounded-xl">
                    <Link to="/billing">View billing &amp; packages</Link>
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
                    href="#appearance"
                    className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Appearance
                  </a>
                  <a
                    href="#notifications"
                    className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Notifications & data
                  </a>
                  <a
                    href="#privacy"
                    className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Privacy
                  </a>
                  <a
                    href="#help"
                    className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Help & information
                  </a>
                </div>
              </nav>
              <div className="space-y-8">
                <div id="security">
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
                  <div className="mt-4">
                    <SignInMethods user={user} />
                  </div>
                </div>

                <div id="appearance">
                  <SettingsGroup title="Appearance & feed">
                    <ToggleRow
                      icon={
                        prefs.theme === "dark" ? (
                          <Moon className="size-4" />
                        ) : (
                          <Sun className="size-4" />
                        )
                      }
                      title="Dark theme"
                      description="Candid pulse always stays dark for readability."
                      checked={prefs.theme === "dark"}
                      onCheckedChange={(next) => setPreference("theme", next ? "dark" : "light")}
                    />
                    <ToggleRow
                      icon={<Gauge className="size-4" />}
                      title="Reduce motion"
                      description="Tone down interface animations."
                      checked={prefs.reduceMotion}
                      onCheckedChange={(next) => setPreference("reduceMotion", next)}
                    />
                    <ToggleRow
                      icon={<ScrollText className="size-4" />}
                      title="Compact feed cards"
                      description="Show shorter previews so more stories fit on screen."
                      checked={prefs.compactFeed}
                      onCheckedChange={(next) => setPreference("compactFeed", next)}
                    />
                  </SettingsGroup>
                </div>

                <div id="notifications">
                  <SettingsGroup title="Notifications & data">
                    <ActionRow
                      icon={<Bell className="size-4" />}
                      title="Notification centre"
                      description="Review your recent Candid activity."
                      actionLabel="Open"
                      onClick={openNotifications}
                    />
                    <ActionRow
                      icon={<RefreshCw className="size-4" />}
                      title="Refresh cached content"
                      description="Fetch the newest stories, companies and salary data."
                      actionLabel="Refresh"
                      onClick={() => {
                        void queryClient.invalidateQueries();
                        notify.success("Fetching the latest content");
                      }}
                    />
                    <ActionRow
                      icon={<Trash2 className="size-4" />}
                      title="Clear offline cache"
                      description="Remove locally saved content. It will reload on your next visit."
                      actionLabel="Clear"
                      destructive
                      onClick={() => {
                        clearPersistedQueries();
                        storageService.clearCache();
                        queryClient.clear();
                        notify.info("Local cache cleared");
                      }}
                    />
                  </SettingsGroup>
                </div>

                <div id="privacy">
                  <PrivacySettings />
                </div>

                <div id="help">
                  <SettingsGroup title="Help & information">
                    <LinkRow
                      icon={<Headset className="size-4" />}
                      title="Help & support"
                      description="Get help with your account, a story or privacy."
                      to="/support"
                    />
                    <LinkRow
                      icon={<BookOpen className="size-4" />}
                      title="Community guidelines"
                      description="What you can and cannot post."
                      to="/guidelines"
                    />
                    <LinkRow
                      icon={<ShieldCheck className="size-4" />}
                      title="Safety & your rights"
                      description="Kenyan labour rights and how to stay safe."
                      to="/rights"
                    />
                    <LinkRow
                      icon={<ScrollText className="size-4" />}
                      title="Privacy, terms & disclaimer"
                      description="How your data is handled."
                      to="/privacy"
                    />
                  </SettingsGroup>
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
              This permanently removes every Firestore document. Firebase Authentication accounts and
              Cloudinary uploads are not included. Type <strong>{RESET_CONFIRMATION}</strong> to
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
  const [providerIds, setProviderIds] = useState(
    () => user?.providerData.map((provider) => provider.providerId) ?? [],
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setProviderIds(user?.providerData.map((provider) => provider.providerId) ?? []);
  }, [user]);

  const googleLinked = providerIds.includes(GoogleAuthProvider.PROVIDER_ID);
  const passwordLinked = providerIds.includes(EmailAuthProvider.PROVIDER_ID);
  const googleEmail = user?.providerData.find(
    (provider) => provider.providerId === GoogleAuthProvider.PROVIDER_ID,
  )?.email;
  const accountEmail = user?.email ?? googleEmail ?? null;

  async function connectGoogle() {
    if (!user) return;
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("email");
      provider.addScope("profile");
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await linkWithPopup(user, provider);
      setProviderIds(result.user.providerData.map((item) => item.providerId));
      notify.success("Google is connected. You can use either sign-in method now.");
    } catch (error) {
      const code = signInMethodErrorCode(error);
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        notify.error(signInMethodError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function addPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !accountEmail || password.length < 8) return;
    setBusy(true);
    try {
      const credential = EmailAuthProvider.credential(accountEmail, password);
      const result = await linkWithCredential(user, credential);
      setProviderIds(result.user.providerData.map((item) => item.providerId));
      setPassword("");
      notify.success("Password added. You can use either sign-in method now.");
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
          Sign in to connect Google and email/password to one account.
        </p>
      ) : (
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Connect both methods to use either one for this same Candid account.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Google</p>
              <p className="text-xs text-muted-foreground">
                {googleLinked
                  ? accountEmail
                    ? `Connected as ${accountEmail}`
                    : "Connected, but Google did not share an email"
                  : "Not connected"}
              </p>
            </div>
            {!googleLinked ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={connectGoogle}
              >
                Connect Google
              </Button>
            ) : null}
          </div>
          <div className="border-t border-border pt-4">
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
                Google did not provide an email for this account, so a password cannot be added.
                Continue signing in with Google.
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
    <Row {...row}>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </Row>
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

function LinkRow({
  to,
  ...row
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  to: "/support" | "/guidelines" | "/rights" | "/privacy";
}) {
  return (
    <Link to={to} className="block transition-colors hover:bg-secondary/50">
      <Row {...row}>
        <ArrowLeft className="size-4 rotate-180 text-muted-foreground" />
      </Row>
    </Link>
  );
}
