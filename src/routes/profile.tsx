import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  Archive,
  BadgeCheck,
  ChevronRight,
  Clock3,
  LogOut,
  MessageSquare,
  PenLine,
  Settings,
  ShieldCheck,
  UserRound,
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
import {
  declareAccountType,
  getOnboardingState,
  updateMyUsername,
} from "@/lib/onboarding.functions";
import { claimVerificationBadge, getVerificationState } from "@/lib/verification.functions";
import { FollowedStories } from "@/components/site/followed-stories";
import { useAuth } from "@/hooks/useAuth";
import { inbox, notify as toast } from "@/lib/notifications-store";
import { FloatingBackButton } from "@/components/site/floating-back-button";
import { ProfileAvatar, ProfilePhotoPicker } from "@/components/site/profile-photo";
import { MembershipBadge } from "@/components/site/membership-badge";
import { getMyContributions } from "@/lib/social.functions";
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
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  const fetchOnboardingState = useServerFn(getOnboardingState);
  const onboarding = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => fetchOnboardingState(),
    enabled: Boolean(user),
  });
  const socials = onboarding.data?.socials ?? null;
  const updateUsername = useServerFn(updateMyUsername);
  const fetchContributions = useServerFn(getMyContributions);
  const contributions = useQuery({
    queryKey: ["my-contributions", user?.uid ?? null],
    queryFn: () => fetchContributions(),
    enabled: Boolean(user),
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
  async function saveUsername() {
    if (savingUsername) return;
    setSavingUsername(true);
    try {
      const result = await updateUsername({ data: { username: usernameDraft } });
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["onboarding-state", user?.uid] });
      setEditingUsername(false);
      toast.success(`Username changed to @${result.username}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change username.");
    } finally {
      setSavingUsername(false);
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
        inbox.success("Verification request sent for review", { dedupeKey: "badge-review-pending" });
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
              className="border-b border-border pb-5 md:glass-card md:rounded-2xl md:border md:border-border md:p-6"
            >
              <div className="flex items-center gap-4">
                {user ? (
                  <ProfilePhotoPicker
                    compact
                    avatarOnly
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
                    }}
                  />
                ) : (
                  <ProfileAvatar
                    photoUrl={onboarding.data?.photoUrl}
                    initials={(handle.replace("@", "")[0] ?? "U").toUpperCase()}
                    className="size-14 shrink-0 md:size-16"
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
                    ) : handle}
                    {verification.data?.badgeStatus === "claimed" ? (
                      <BadgeCheck className="size-5 shrink-0 text-verified" aria-label="Verified" />
                    ) : null}
                    <MembershipBadge tier={onboarding.data?.membership?.tier} />
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
              {user ? (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  {onboarding.data?.username ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {editingUsername ? (
                        <>
                          <input
                            value={usernameDraft}
                            onChange={(event) =>
                              setUsernameDraft(
                                event.target.value.toLowerCase().replace(/\s+/g, "_"),
                              )
                            }
                            maxLength={20}
                            autoComplete="off"
                            className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                            aria-label="New username"
                          />
                          <Button
                            size="sm"
                            disabled={savingUsername || !usernameDraft.trim()}
                            onClick={() => void saveUsername()}
                          >
                            {savingUsername ? "Saving…" : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingUsername(false)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              nextUsernameChangeAt !== null && Date.now() < nextUsernameChangeAt
                            }
                            onClick={() => {
                              setUsernameDraft(onboarding.data?.username ?? "");
                              setEditingUsername(true);
                            }}
                          >
                            Change username
                          </Button>
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
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
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
                  <p className="text-sm text-muted-foreground">Your verification request is being reviewed. We’ll update this profile when there’s a decision.</p>
                </div>
              ) : null}
              <div className="mt-4 flex items-start gap-3 border-l-2 border-verified/35 py-2 pl-3 md:mt-5 md:rounded-xl md:border md:border-verified/15 md:bg-verified/5 md:p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-verified" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Your email is only used to sign in. Your Candid handle appears on stories and
                  comments; individual votes are never shown.
                </p>
              </div>
            </motion.section>

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
  data?: undefined | { active: ContributionGroup; inactive: ContributionGroup; pending: ContributionGroup };
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
                      to="/stories/$id"
                      params={{ id: item.type === "story" ? item.id : (item.storyId ?? "") }}
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
                          {item.type} ·{" "}
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
