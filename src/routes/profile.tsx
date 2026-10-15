import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  Archive,
  BadgeCheck,
  ChevronRight,
  Clock3,
  Link2,
  LogOut,
  MessageSquare,
  PenLine,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
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
import { ProfileAvatar, ProfileCoverPicker, ProfilePhotoPicker } from "@/components/site/profile-photo";
import { MembershipBadge } from "@/components/site/membership-badge";
import { getMyContributions } from "@/lib/social.functions";
import { getPublicProfile } from "@/lib/messaging.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile | Candid" },
      {
        name: "description",
        content: "View your Candid profile, contributions and followed stories.",
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
  const fetchContributions = useServerFn(getMyContributions);
  const contributions = useQuery({
    queryKey: ["my-contributions", user?.uid ?? null],
    queryFn: () => fetchContributions(),
    enabled: Boolean(user),
  });
  const fetchPublicProfile = useServerFn(getPublicProfile);
  const publicProfile = useQuery({
    queryKey: ["my-public-profile", user?.uid ?? null, onboarding.data?.username ?? null],
    queryFn: () => fetchPublicProfile({ data: { username: onboarding.data?.username ?? "" } }),
    enabled: Boolean(user && onboarding.data?.username),
  });

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
      if (result.ok && "approved" in result && result.approved) {
        inbox.success("Badge claimed — your account is now verified", {
          dedupeKey: "badge-claimed",
        });
        await verification.refetch();
      } else if (result.ok && "pending" in result && result.pending) {
        inbox.success("Verification request sent for review", {
          dedupeKey: "badge-review-pending",
        });
        await verification.refetch();
      } else {
        toast.error("reason" in result ? result.reason : "Could not submit the request");
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
  const nextUsernameChangeAt = onboarding.data?.usernameChangedAt
    ? Date.parse(onboarding.data.usernameChangedAt) + 14 * 24 * 60 * 60 * 1000
    : null;

  return (
    <div className="min-h-screen bg-background">
      <FloatingBackButton onClick={() => navigate({ to: "/" })} className="hidden md:inline-flex" />
      <section className="min-h-screen px-3 pb-4 pt-2 sm:px-5 sm:pt-2 md:px-8 md:py-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mx-auto w-full max-w-5xl space-y-4 pb-8 md:space-y-6"
          >
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.06, ease: "easeOut" }}
              className="relative -mx-3 overflow-hidden rounded-none border-y border-x-0 border-border bg-card pb-4 shadow-sm sm:mx-0 sm:rounded-3xl sm:border-x md:glass-card md:p-0"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="relative h-[170px] overflow-hidden sm:h-56 md:h-64"
              >
                <ProfileCoverPicker
                  coverUrl={onboarding.data?.coverUrl}
                  editable={Boolean(user)}
                  onSaved={(coverUrl) => {
                    queryClient.setQueryData(
                      ["onboarding-state", user?.uid ?? null],
                      (previous: unknown) =>
                        previous && typeof previous === "object"
                          ? { ...previous, coverUrl }
                          : previous,
                    );
                    void queryClient.invalidateQueries({ queryKey: ["public-profile"] });
                  }}
                />
              </motion.div>
              <div className="relative px-4 pb-4 sm:px-6 md:px-8 md:pb-6">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.08 }}
                className="-mt-10 flex flex-wrap items-end gap-3 sm:-mt-12 sm:flex-nowrap sm:gap-4"
              >
                {user ? (
                  <ProfilePhotoPicker
                    compact
                    avatarOnly
                    avatarClassName="size-20 border-4 border-card shadow-lg md:size-24"
                    photoUrl={onboarding.data?.photoUrl}
                    initials={(handle.replace("@", "")[0] ?? "U").toUpperCase()}
                    onSaved={(photoUrl) => {
                      queryClient.setQueryData(
                        ["onboarding-state", user.uid],
                        (previous: unknown) =>
                          previous && typeof previous === "object"
                            ? { ...previous, photoUrl }
                            : previous,
                      );
                      void queryClient.invalidateQueries({ queryKey: ["public-profile"] });
                    }}
                  />
                ) : (
                  <ProfileAvatar
                    photoUrl={onboarding.data?.photoUrl}
                    initials={(handle.replace("@", "")[0] ?? "U").toUpperCase()}
                    className="size-20 shrink-0 border-4 border-card shadow-lg md:size-24"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Your account
                  </p>
                  <h1 className="mt-1 flex items-center gap-1.5 truncate text-xl font-semibold md:text-2xl">
                    {onboarding.data?.username ? (
                      <Link
                        to="/u/$username"
                        params={{ username: onboarding.data.username }}
                        className="hover:text-primary"
                      >
                        {handle}
                      </Link>
                    ) : (
                      handle
                    )}
                    {verification.data?.badgeStatus === "claimed" ? (
                      <BadgeCheck className="size-5 shrink-0 text-verified" aria-label="Verified" />
                    ) : null}
                    <MembershipBadge
                      tier={onboarding.data?.membership?.tier}
                      official={onboarding.data?.accountType === "official"}
                    />
                  </h1>
                  <p className="truncate text-sm text-muted-foreground">
                    {loading
                      ? "Checking your session…"
                      : user
                        ? "Your Candid identity"
                        : "Not signed in"}
                  </p>
                </div>
                {user && !onboarding.data?.username && !onboarding.isLoading ? (
                  <Button asChild size="sm" variant="outline" className="ml-auto">
                    <Link to="/onboarding" search={{ editUsername: false }}>
                      Claim username
                    </Link>
                  </Button>
                ) : null}
                {!user && !loading ? (
                  <Button asChild size="sm" className="ml-auto glow-primary">
                    <Link to="/auth">Sign in</Link>
                  </Button>
                ) : null}
              </motion.div>
              {user && onboarding.data?.username ? (
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
                  <Button asChild className="h-11 rounded-xl">
                    <Link to="/post">
                      <PenLine className="size-4" /> Share a story
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" className="h-11 rounded-xl">
                    <Link to="/u/$username" params={{ username: onboarding.data.username }}>
                      <Link2 className="size-4" /> View public profile
                    </Link>
                  </Button>
                </div>
              ) : null}
              {user ? (
                <div className="mt-3 space-y-4 border-t border-border pt-4">
                  {onboarding.data?.username ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {nextUsernameChangeAt !== null && Date.now() < nextUsernameChangeAt ? (
                        <Button size="sm" variant="outline" disabled>
                          Change username
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/onboarding" search={{ editUsername: true }}>
                            Change username
                          </Link>
                        </Button>
                      )}
                      {nextUsernameChangeAt ? (
                        <span className="text-xs text-muted-foreground">
                          Next change after{" "}
                          {new Date(nextUsernameChangeAt).toLocaleDateString("en-KE")}.
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Username changes are limited to once every 2 weeks.
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {verification.data?.canClaim ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-l-2 border-primary/40 py-2 pl-3 md:rounded-xl md:border md:border-primary/30 md:bg-primary/5 md:p-3">
                  <BadgeCheck className="size-5 shrink-0 text-primary" />
                  <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {verification.data.companyName
                      ? `Your account is recognised as ${verification.data.companyName}.`
                      : "Your account is recognised as official."}{" "}
                    Request the verified badge.
                  </p>
                  <Button size="sm" disabled={claiming} onClick={() => void handleClaimBadge()}>
                    Request review
                  </Button>
                </div>
              ) : null}
              {verification.data?.approvalStatus === "pending_review" ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
                  <BadgeCheck className="size-5 shrink-0 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Your verification request is being reviewed. We’ll update this profile when
                    there’s a decision.
                  </p>
                </div>
              ) : null}
              <div className="mt-4 flex items-start gap-3 border-l-2 border-verified/35 py-2 pl-3 md:mt-5 md:rounded-xl md:border md:border-verified/15 md:bg-verified/5 md:p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-verified" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Your email stays private. Your handle, photo, and cover are public; individual
                  votes stay private.
                </p>
              </div>
              </div>
            </motion.section>

            {user ? (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.12 }}
                className="grid grid-cols-3 gap-2 sm:gap-3"
              >
                <ProfileStat
                  icon={<Users className="size-4 text-primary" />}
                  value={publicProfile.data?.followers ?? (publicProfile.isLoading ? "—" : 0)}
                  label="Followers"
                />
                <ProfileStat
                  icon={<Users className="size-4 text-primary" />}
                  value={publicProfile.data?.following ?? (publicProfile.isLoading ? "—" : 0)}
                  label="Following"
                />
                <ProfileStat
                  icon={<MessageSquare className="size-4 text-primary" />}
                  value={contributions.data?.active.stories.length ?? (contributions.isLoading ? "—" : 0)}
                  label="Stories"
                />
              </motion.section>
            ) : null}

            {socialLinks.length > 0 ? (
              <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Links
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {socialLinks.map(([key, value]) => (
                    <a
                      key={key}
                      href={value ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/10"
                    >
                      <Link2 className="size-3.5" />
                      <span className="capitalize">{key}</span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <FollowedStories />

            {user ? (
              <ContributionsPanel data={contributions.data} loading={contributions.isLoading} />
            ) : null}

            {askAccountType ? (
              <SettingsGroup title="One quick question">
                <div className="px-4 py-3">
                  <p className="text-sm font-medium">Are you here as a worker or an employer?</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    We never worked this out for your account. Employers get a reply tool and a
                    company page; workers can share workplace stories under their Candid handle.
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
              className="grid divide-y divide-border sm:grid-cols-2 sm:gap-3 sm:divide-y-0"
            >
              <Button
                asChild
                variant="outline"
                className="h-auto min-h-14 justify-between rounded-none border-0 bg-transparent px-0 py-3 text-left shadow-none hover:bg-secondary/30 md:min-h-16 md:rounded-xl md:border md:bg-background md:px-4"
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
                  className="h-auto min-h-14 justify-start gap-3 rounded-none border-0 bg-transparent px-0 py-3 text-left text-danger shadow-none hover:bg-danger/5 hover:text-danger md:min-h-16 md:rounded-xl md:border md:border-danger/20 md:bg-background md:px-4"
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
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade space-y-1">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y divide-border border-y border-border bg-transparent md:overflow-hidden md:rounded-2xl md:border md:bg-card">
        {children}
      </div>
    </section>
  );
}

function ProfileStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex items-center gap-2">{icon}<span className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</span></div>
      <p className="mt-1 text-[11px] text-muted-foreground sm:text-sm">{label}</p>
    </div>
  );
}

type ContributionItem = {
  id: string;
  title: string;
  createdAt: string;
  type: "story" | "comment";
  storyId?: string;
};
type ContributionGroup = { stories: ContributionItem[]; comments: ContributionItem[] };

function ContributionsPanel({
  data,
  loading,
}: {
  data?:
    | undefined
    | { active: ContributionGroup; inactive: ContributionGroup; pending: ContributionGroup };
  loading: boolean;
}) {
  const groups = data ?? {
    active: { stories: [], comments: [] },
    inactive: { stories: [], comments: [] },
    pending: { stories: [], comments: [] },
  };
  const count = (group: ContributionGroup) => group.stories.length + group.comments.length;
  return (
    <section className="space-y-3 border-y border-border py-4 md:rounded-2xl md:border md:bg-card md:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Your activity
        </p>
        <h2 className="mt-1 text-lg font-semibold">My contributions</h2>
      </div>
      <Tabs defaultValue="active">
        <TabsList className="grid h-auto w-full grid-cols-3 bg-secondary/60 p-1">
          <TabsTrigger value="active" className="gap-1.5 text-xs sm:text-sm">
            <PenLine className="size-3.5" />
            Active <span>{count(groups.active)}</span>
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5 text-xs sm:text-sm">
            <Clock3 className="size-3.5" />
            Pending <span>{count(groups.pending)}</span>
          </TabsTrigger>
          <TabsTrigger value="inactive" className="gap-1.5 text-xs sm:text-sm">
            <Archive className="size-3.5" />
            Inactive <span>{count(groups.inactive)}</span>
          </TabsTrigger>
        </TabsList>
        {(["active", "pending", "inactive"] as const).map((status) => {
          const group = groups[status];
          const items = [...group.stories, ...group.comments].sort(
            (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
          );
          return (
            <TabsContent key={status} value={status} className="mt-3">
              {loading ? (
                <p className="py-5 text-center text-sm text-muted-foreground">
                  Loading your contributions…
                </p>
              ) : items.length ? (
                <div className="divide-y divide-border">
                  {items.map((item) => (
                    <Link
                      key={`${item.type}-${item.id}`}
                      to={item.type === "story" ? "/post" : "/stories/$id"}
                      {...(item.type === "story"
                        ? { search: { edit: item.id } }
                        : { params: { id: item.storyId ?? "" } })}
                      className="flex items-start gap-3 py-3 first:pt-1 last:pb-1"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {item.type === "story" ? (
                          <PenLine className="size-4" />
                        ) : (
                          <MessageSquare className="size-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-sm font-medium">{item.title}</span>
                        <span className="mt-1 block text-xs capitalize text-muted-foreground">
                          {item.type}
                          {item.type === "story" ? " · Edit and resubmit for approval" : ""} ·{" "}
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString("en-KE")
                            : "Date unavailable"}
                        </span>
                      </span>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="py-5 text-center text-sm text-muted-foreground">
                  {status === "active"
                    ? "Your published stories and comments will appear here."
                    : status === "pending"
                      ? "Nothing is waiting for review."
                      : "No inactive contributions."}
                </p>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </section>
  );
}
