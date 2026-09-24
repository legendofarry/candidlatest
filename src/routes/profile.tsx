import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { BadgeCheck, ChevronRight, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { declareAccountType, getOnboardingState } from "@/lib/onboarding.functions";
import { claimVerificationBadge, getVerificationState } from "@/lib/verification.functions";
import { FollowedStories } from "@/components/site/followed-stories";
import { useAuth } from "@/hooks/useAuth";
import { inbox, notify as toast } from "@/lib/notifications-store";
import { FloatingBackButton } from "@/components/site/floating-back-button";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile | Candid" },
      {
        name: "description",
        content: "View your anonymous Candid account and followed stories.",
      },
      { property: "og:title", content: "Your profile | Candid" },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const fetchOnboardingState = useServerFn(getOnboardingState);
  const onboarding = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => fetchOnboardingState(),
    enabled: Boolean(user),
  });
  const socials = onboarding.data?.socials ?? null;

  // Some accounts never got classified at signup. After a week we ask directly,
  // because company replies and employer tools depend on knowing.
  const declareType = useServerFn(declareAccountType);
  const createdAt = user?.metadata?.creationTime ? Date.parse(user.metadata.creationTime) : null;
  const olderThanAWeek = createdAt ? Date.now() - createdAt > 7 * 24 * 60 * 60 * 1000 : false;
  const askAccountType =
    Boolean(user) && onboarding.data?.accountType === "unknown" && olderThanAWeek;
  const [savingType, setSavingType] = useState(false);

  async function chooseAccountType(accountType: "individual" | "company") {
    setSavingType(true);
    try {
      await declareType({ data: { accountType } });
      await queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
      toast.success(
        accountType === "company" ? "Employer account confirmed" : "Thanks — you are set",
        {
          description:
            accountType === "company"
              ? "You can now reply to stories about your company and add your location."
              : "Your account is marked as an individual worker.",
        },
      );
    } catch {
      toast.error("Could not save that", {
        description: "Check your connection and try again.",
      });
    } finally {
      setSavingType(false);
    }
  }
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
    <div className="min-h-screen bg-background md:h-dvh md:overflow-hidden">
      <FloatingBackButton onClick={() => navigate({ to: "/" })} className="hidden md:inline-flex" />
      <div className="grid min-h-screen md:h-dvh md:min-h-0 md:grid-cols-2">
        <section className="relative hidden overflow-hidden border-r border-border bg-[linear-gradient(145deg,#18312d_0%,#18272c_58%,#292c24_100%)] px-12 py-20 text-white md:flex md:h-dvh md:items-center">
          <motion.div
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mx-auto w-full max-w-lg"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
              <ShieldCheck className="size-4" /> Member identity
            </div>
            <h2 className="mt-5 max-w-md text-4xl font-semibold leading-tight">
              Your voice stays private. Your impact stays visible.
            </h2>
            <p className="mt-3 max-w-md text-base leading-7 text-white/70">
              Keep track of the stories you follow and manage the public details people can see.
            </p>
            <div className="relative mt-14 flex h-64 items-center justify-center">
              <motion.div
                className="absolute flex size-48 items-center justify-center rounded-full border border-emerald-200/20"
                animate={{ rotate: 360 }}
                transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
              >
                <span className="absolute left-5 top-6 size-3 rounded-full bg-emerald-300" />
                <span className="absolute bottom-5 right-7 size-2 rounded-full bg-amber-200" />
              </motion.div>
              <motion.div
                className="relative flex size-32 items-center justify-center rounded-3xl border border-white/15 bg-white/[0.08] text-emerald-200 shadow-2xl backdrop-blur"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <UserRound className="size-14" />
                <span className="absolute -bottom-3 -right-3 flex size-11 items-center justify-center rounded-xl border border-white/15 bg-[#1a2927] text-amber-200">
                  <ShieldCheck className="size-5" />
                </span>
              </motion.div>
            </div>
          </motion.div>
        </section>
        <section className="min-h-screen overflow-y-auto px-5 py-5 md:flex md:h-dvh md:min-h-0 md:flex-col md:px-10 md:py-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="my-auto mx-auto w-full max-w-3xl space-y-5 pb-6 md:space-y-6"
          >
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.06, ease: "easeOut" }}
              className="glass-card rounded-2xl border border-border p-5 md:p-6"
            >
              <div className="flex items-center gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary md:size-16">
                  <UserRound className="size-7 md:size-8" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Your account
                  </p>
                  <h1 className="mt-1 flex items-center gap-1.5 truncate text-xl font-semibold md:text-2xl">
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
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-verified/15 bg-verified/5 p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-verified" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Your email is only used to sign in. Stories, votes and comments appear under an
                  anonymous handle.
                </p>
              </div>
            </motion.section>

            <FollowedStories />

            {askAccountType ? (
              <SettingsGroup title="One quick question">
                <div className="px-4 py-3">
                  <p className="text-sm font-medium">Are you here as a worker or an employer?</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    We never worked this out for your account. Employers get a reply tool and a
                    company page; workers keep posting anonymously as usual.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={savingType}
                      onClick={() => void chooseAccountType("individual")}
                    >
                      I am a worker
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingType}
                      onClick={() => void chooseAccountType("company")}
                    >
                      I represent a company
                    </Button>
                  </div>
                </div>
              </SettingsGroup>
            ) : null}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18, ease: "easeOut" }}
              className="grid gap-3 sm:grid-cols-2"
            >
              <Button
                asChild
                variant="outline"
                className="h-auto min-h-16 justify-between rounded-xl px-4 py-3 text-left"
              >
                <Link to="/settings">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Settings className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">Account settings</span>
                      <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                        Privacy and preferences
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </Button>

              {user ? (
                <Button
                  variant="outline"
                  className="h-auto min-h-16 justify-start gap-3 rounded-xl border-danger/20 px-4 py-3 text-left text-danger hover:bg-danger/5 hover:text-danger"
                  onClick={() => setConfirmSignOut(true)}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger/10">
                    <LogOut className="size-4" />
                  </span>
                  <span>
                    <span className="block font-medium">Sign out</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      End this session
                    </span>
                  </span>
                </Button>
              ) : null}
            </motion.div>

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
          </motion.div>
        </section>
      </div>
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
