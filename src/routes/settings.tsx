import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Fingerprint,
  Gauge,
  LifeBuoy,
  Moon,
  RefreshCw,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="min-h-screen bg-background">
      <button
        type="button"
        onClick={() => navigate({ to: "/" })}
        aria-label="Back to Candid"
        className="fixed left-5 top-5 z-30 inline-flex size-11 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-lg backdrop-blur transition-transform hover:-translate-x-0.5 md:left-7 md:top-7"
      >
        <ArrowLeft className="size-5" />
      </button>
      <div className="grid min-h-screen lg:grid-cols-[minmax(340px,0.86fr)_1.14fr]">
        <section className="relative hidden min-h-screen overflow-hidden bg-[#132523] px-12 py-24 text-white lg:flex lg:items-center">
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

        <section className="min-h-screen overflow-y-auto px-5 pb-12 pt-24 sm:px-10 lg:px-12 lg:pt-16">
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
                      icon={<LifeBuoy className="size-4" />}
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

                <Button asChild variant="outline" className="w-full">
                  <Link to="/profile">View profile</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
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
