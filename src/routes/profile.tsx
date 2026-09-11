import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bell,
  BookOpen,
  ChevronRight,
  Fingerprint,
  Gauge,
  LogOut,
  Moon,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOnboardingState } from "@/lib/onboarding.functions";
import {
  claimVerificationBadge,
  getVerificationState,
} from "@/lib/verification.functions";
import { FollowedStories } from "@/components/site/followed-stories";
import { PrivacySettings } from "@/components/site/privacy-settings";
import { useAuth } from "@/hooks/useAuth";
import { inbox, notify as toast, openNotifications } from "@/lib/notifications-store";
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

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile & settings | Candid" },
      {
        name: "description",
        content:
          "Manage your anonymous Candid account: fast biometric unlock, appearance, notifications, offline cache, privacy and community guidelines.",
      },
      { property: "og:title", content: "Your profile & settings | Candid" },
      {
        property: "og:description",
        content: "Account, appearance, biometric unlock, data and privacy controls in one place.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const prefs = usePreferences();
  const queryClient = useQueryClient();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

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
      toast.info("Fast unlock turned off");
      return;
    }
    try {
      await registerBiometric(user.uid, user.email ?? "Candid user");
      setEnrolled(true);
      setPreference("biometricUnlock", true);
      inbox.success("Fingerprint / face unlock enabled on this device", {
        description: "You can turn it off any time from your profile.",
        dedupeKey: "biometric-enabled",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable biometric unlock");
    }
  }

  const fetchOnboardingState = useServerFn(getOnboardingState);
  const onboarding = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => fetchOnboardingState(),
    enabled: Boolean(user),
  });
  const socials = onboarding.data?.socials ?? null;
  const socialLinks = socials
    ? (Object.entries(socials) as [string, string | null][]).filter(([, value]) => Boolean(value))
    : [];

  const fetchVerification = useServerFn(getVerificationState);
  const claimBadgeFn = useServerFn(claimVerificationBadge);
  const verification = useQuery({
    queryKey: ["verification-state", user?.uid ?? null],
    queryFn: () => fetchVerification(),
    enabled: Boolean(user),
  });
  const [claiming, setClaiming] = useState(false);

  async function handleClaimBadge() {
    setClaiming(true);
    try {
      const result = await claimBadgeFn();
      if (result.ok) {
        inbox.success("Badge claimed — your account is now verified", {
          dedupeKey: "badge-claimed",
        });
        await verification.refetch();
      } else {
        toast.error(result.reason);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not claim the badge");
    } finally {
      setClaiming(false);
    }
  }

  const handle = onboarding.data?.username
    ? `@${onboarding.data.username}`
    : user?.email
      ? `anon-${user.uid.slice(0, 6)}`
      : "Guest";

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-6">
      <section className="glass-card animate-rise rounded-2xl border border-border p-5">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <UserRound className="size-7" />
          </div>
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 truncate text-xl font-semibold">
              {handle}
              {verification.data?.badgeStatus === "claimed" ? (
                <BadgeCheck className="size-5 shrink-0 text-verified" aria-label="Verified" />
              ) : null}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {loading
                ? "Checking your session…"
                : user
                  ? "Signed in · your identity is never shown publicly"
                  : "Not signed in"}
            </p>
          </div>
          {user && !onboarding.data?.username && !onboarding.isLoading ? (
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <Link to="/onboarding">Claim username</Link>
            </Button>
          ) : null}
          {!user && !loading ? (
            <Button asChild size="sm" className="ml-auto glow-primary">
              <Link to="/auth">Sign in</Link>
            </Button>
          ) : null}
        </div>
        {socialLinks.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {socialLinks.map(([key, value]) => (
              <span
                key={key}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
              >
                <span className="capitalize text-foreground">{key}</span> · {value}
              </span>
            ))}
          </div>
        ) : null}
        {verification.data?.canClaim ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <BadgeCheck className="size-5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              {verification.data.companyName
                ? `Your account is recognised as ${verification.data.companyName}.`
                : "Your account is recognised as official."}{" "}
              Claim your verified badge — it's free.
            </p>
            <Button size="sm" disabled={claiming} onClick={() => void handleClaimBadge()}>
              Claim badge
            </Button>
          </div>
        ) : null}
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-verified" />
          Your email is used only to sign in. Stories, votes and comments appear under an anonymous
          handle.
        </p>
      </section>

      <FollowedStories />

      <SettingsGroup title="Security & fast access">
        <ToggleRow
          icon={<Fingerprint className="size-4" />}
          title="Fingerprint / face unlock"
          description={
            !user
              ? "Sign in first to set up biometric unlock."
              : bioAvailable
                ? "Unlock Candid instantly on this device instead of typing a password."
                : "This device has no fingerprint or face sensor available to the browser."
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

      <SettingsGroup title="Appearance & feed">
        <ToggleRow
          icon={prefs.theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          title="Dark theme"
          description="Candid pulse always stays dark for readability."
          checked={prefs.theme === "dark"}
          onCheckedChange={(next) => setPreference("theme", next ? "dark" : "light")}
        />
        <ToggleRow
          icon={<Gauge className="size-4" />}
          title="Reduce motion"
          description="Tone down splash, card and banner animations."
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

      <SettingsGroup title="Notifications & data">
        <ActionRow
          icon={<Bell className="size-4" />}
          title="Notification centre"
          description="Everything Candid has told you, in one place."
          actionLabel="Open"
          onClick={openNotifications}
        />
        <ActionRow
          icon={<RefreshCw className="size-4" />}
          title="Refresh cached content"
          description="Pull the newest stories, companies and salary data now."
          actionLabel="Refresh"
          onClick={() => {
            void queryClient.invalidateQueries();
            toast.success("Fetching the latest content");
          }}
        />
        <ActionRow
          icon={<Trash2 className="size-4" />}
          title="Clear offline cache"
          description="Frees local storage. The app will reload data on next use."
          actionLabel="Clear"
          destructive
          onClick={() => {
            clearPersistedQueries();
            storageService.clearCache();
            queryClient.clear();
            toast.info("Local cache cleared");
          }}
        />
      </SettingsGroup>

      <PrivacySettings />

      <SettingsGroup title="About Candid">
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
        <LinkRow
          icon={<UserRound className="size-4" />}
          title="About the project"
          description="Why Candid exists."
          to="/about"
        />
      </SettingsGroup>

      {user ? (
        <Button variant="outline" className="w-full text-danger" onClick={() => setConfirmSignOut(true)}>
          <LogOut className="size-4" /> Sign out
        </Button>
      ) : null}

      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of Candid?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to post stories, comment or vote.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSignOut(false);
                void signOut().then(() => navigate({ to: "/" }));
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade space-y-1">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {children}
      </div>
    </section>
  );
}

function RowShell({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  checked,
  onCheckedChange,
  disabled,
  ...rest
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <RowShell {...rest}>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </RowShell>
  );
}

function ActionRow({
  actionLabel,
  onClick,
  destructive,
  ...rest
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <RowShell {...rest}>
      <Button
        size="sm"
        variant="outline"
        className={destructive ? "text-danger" : undefined}
        onClick={onClick}
      >
        {actionLabel}
      </Button>
    </RowShell>
  );
}

function LinkRow({
  to,
  ...rest
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link to={to} className="block transition-colors hover:bg-secondary/50">
      <RowShell {...rest}>
        <ChevronRight className="size-4 text-muted-foreground" />
      </RowShell>
    </Link>
  );
}
