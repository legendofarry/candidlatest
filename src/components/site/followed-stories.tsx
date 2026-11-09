import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  CircleDot,
  Clock3,
  FileText,
  Loader2,
  MessageCircle,
  Sparkles,
  UsersRound,
  X as CloseIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getFollowStats,
  getFollowedStories,
  getStoryCatchUp,
  markStoryCaughtUp,
} from "@/lib/social.functions";
import { notify as toast } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { formatCount } from "@/lib/utils";
import { useAutoCollapsingCount } from "@/hooks/use-auto-collapsing-count";
import { getPublicProfileConnections } from "@/lib/messaging.functions";
import { ProfileAvatar } from "@/components/site/profile-photo";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

type StoryTimeline = {
  id: string;
  data: {
    story: { title: string; body: string; created_at: string; company_name: string | null };
    summary: string;
    timeline: { id: string; body: string; created_at: string; official: boolean }[];
    totalUpdates: number;
    latestUpdateAt: string;
  };
};

type FollowedStoryRow = {
  story_id: string;
  title: string | null;
  company_name: string | null;
  company_verified: boolean;
  new_comments: number;
  total_comments: number;
};

/** Followers/following counts plus followed stories with an AI catch-up. */
export function FollowedStories({ username }: { username: string | null }) {
  const { user } = useAuth();
  const statsFn = useServerFn(getFollowStats);
  const listFn = useServerFn(getFollowedStories);
  const catchUpFn = useServerFn(getStoryCatchUp);
  const seenFn = useServerFn(markStoryCaughtUp);

  const [openId, setOpenId] = useState<string | null>(null);
  const { visibleCount, expandBy } = useAutoCollapsingCount(10);
  const [storyTimeline, setStoryTimeline] = useState<StoryTimeline | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [catchUpError, setCatchUpError] = useState<string | null>(null);
  const [statsView, setStatsView] = useState<"followers" | "following" | "stories" | null>(null);

  const stats = useQuery({
    queryKey: ["follow-stats", user?.uid ?? null],
    queryFn: () => statsFn({ data: { user_id: null } }),
    enabled: Boolean(user),
  });

  const stories = useInfiniteQuery({
    queryKey: ["followed-stories", user?.uid ?? null],
    initialPageParam: null as { lastSeenAt: string; id: string } | null,
    queryFn: ({ pageParam }) => listFn({ data: { limit: 20, cursor: pageParam } }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: Boolean(user),
  });

  if (!user) return null;

  async function handleCatchUp(storyId: string) {
    setLoadingId(storyId);
    setOpenId(storyId);
    setStoryTimeline(null);
    setCatchUpError(null);
    try {
      const result = await catchUpFn({ data: { story_id: storyId } });
      setStoryTimeline({ id: storyId, data: result });
      await seenFn({ data: { story_id: storyId } });
      void stories.refetch();
    } catch (error) {
      setCatchUpError(error instanceof Error ? error.message : "Could not build the catch-up");
      toast.error(error instanceof Error ? error.message : "Could not build the catch-up");
    } finally {
      setLoadingId(null);
    }
  }

  const list: FollowedStoryRow[] =
    stories.data?.pages.flatMap((page) => page.items as FollowedStoryRow[]) ?? [];
  const visibleStories = list.slice(0, visibleCount);
  const selectedStory = list.find((item) => item.story_id === openId) ?? null;

  return (
    <section className="animate-rise border-b border-border pb-5 md:glass-card md:rounded-2xl md:border md:border-border md:p-6">
      <div className="sticky top-16 z-20 -mx-1 flex items-center gap-3 bg-background/95 py-2 backdrop-blur-md md:top-0">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bookmark className="size-5" />
        </div>
        <div>
          <h2 className="mt-0.5 font-display text-lg font-semibold">Your story follow-up</h2>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x divide-border md:gap-2 md:divide-x-0">
        <FollowMetric
          label="Followers"
          value={stats.data?.followers ?? 0}
          onClick={() => setStatsView("followers")}
        />
        <FollowMetric
          label="Following"
          value={stats.data?.following ?? 0}
          onClick={() => setStatsView("following")}
        />
        <FollowMetric label="Stories" value={list.length} onClick={() => setStatsView("stories")} />
      </div>
      <ProfileStatsDrawer
        username={username}
        open={statsView !== null}
        initialView={statsView}
        followerCount={stats.data?.followers ?? 0}
        followingCount={stats.data?.following ?? 0}
        followedStories={list}
        onOpenChange={(open) => {
          if (!open) setStatsView(null);
        }}
      />

      <ul className="mt-4 space-y-2.5">
        {stories.isPending ? (
          <li className="border-b border-border px-2 py-3 text-sm text-muted-foreground md:rounded-xl md:border md:bg-card/50 md:px-4">
            Loading followed stories…
          </li>
        ) : list.length === 0 ? (
          <li className="flex flex-wrap items-center gap-3 border-l-2 border-dashed border-border py-3 pl-3 md:rounded-xl md:border md:bg-secondary/30 md:p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground">
              <Bookmark className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">No saved stories</p>
            </div>
            <Button asChild size="sm" variant="ghost" className="ml-auto">
              <Link to="/">
                Explore feed <ArrowRight className="size-4" />
              </Link>
            </Button>
          </li>
        ) : null}

        {visibleStories.map((item, index) => (
          <motion.li
            key={item.story_id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.04 }}
            className="overflow-hidden border-b border-border py-3 transition-colors md:rounded-2xl md:border md:bg-card/60 md:p-4 md:hover:bg-secondary/20"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageCircle className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  to="/stories/$id"
                  params={{ id: item.story_id }}
                  className="line-clamp-2 text-sm font-medium hover:text-primary"
                >
                  {item.title ?? "Untitled story"}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {item.company_name ?? "Unknown company"}
                    {item.company_verified ? <CompanyVerifiedBadge /> : null}
                  </span>{" "}
                  ·{" "}
                  {item.new_comments > 0
                    ? `${formatCount(item.new_comments)} ${item.new_comments === 1 ? "new reply" : "new replies"} · ${formatCount(item.total_comments)} total`
                    : `${formatCount(item.total_comments)} ${item.total_comments === 1 ? "reply" : "replies"} · up to date`}
                </p>
              </div>
              <Button
                size="sm"
                variant={item.new_comments > 0 ? "default" : "outline"}
                disabled={loadingId === item.story_id}
                onClick={() => void handleCatchUp(item.story_id)}
                className="shrink-0 rounded-full"
              >
                {loadingId === item.story_id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Clock3 className="size-4" />
                )}
                <span className="hidden sm:inline">Follow the story</span>
                <span className="sm:hidden">Catch up</span>
              </Button>
            </div>
          </motion.li>
        ))}
        {list.length > visibleStories.length || stories.hasNextPage ? (
          <li className="flex flex-col items-center gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              {stories.hasNextPage
                ? `Showing ${formatCount(visibleStories.length)} followed stories loaded so far`
                : `Showing ${formatCount(visibleStories.length)} of ${formatCount(list.length)} followed stories`}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={stories.isFetchingNextPage}
              onClick={(event) => {
                if (visibleCount < list.length) {
                  expandBy(10, event.currentTarget);
                } else if (stories.hasNextPage) {
                  const anchor = event.currentTarget;
                  void stories.fetchNextPage().then((result) => {
                    if (result.isSuccess) expandBy(10, anchor);
                  });
                }
              }}
            >
              {stories.isFetchingNextPage
                ? "Loading followed stories…"
                : visibleCount < list.length
                  ? "Show 10 more"
                  : "Load more followed stories"}
            </Button>
          </li>
        ) : null}
      </ul>

      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null);
            setStoryTimeline(null);
            setCatchUpError(null);
          }
        }}
      >
        <DialogContent
          hideCloseButton
          className="!fixed !inset-0 !left-0 !top-0 !grid !h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 !grid-rows-[auto_minmax(0,1fr)_auto] !gap-0 !overflow-hidden !rounded-none !border-0 !p-0"
        >
          <div className="relative border-b border-border bg-background/95 px-5 py-4 pr-16 shadow-sm backdrop-blur sm:px-8 sm:py-5 sm:pr-20">
            <DialogHeader className="text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                Story follow-up
              </p>
              <DialogTitle className="mt-1 line-clamp-2 text-base sm:text-xl">
                {storyTimeline?.data.story.title ?? selectedStory?.title ?? "Loading story…"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {storyTimeline?.data.story.company_name ??
                  selectedStory?.company_name ??
                  "Your followed story"}
              </DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <button
                type="button"
                className="absolute right-4 top-1/2 flex min-h-11 -translate-y-1/2 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-medium shadow-sm transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-6"
              >
                <CloseIcon className="size-4" />
                <span>Close</span>
              </button>
            </DialogClose>
          </div>

          <div className="overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-3xl space-y-5 px-5 py-6 sm:px-8 sm:py-9">
              {loadingId === openId ? (
                <div className="flex min-h-[45dvh] flex-col items-center justify-center gap-4 text-center">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Loader2 className="size-6 animate-spin" />
                  </span>
                  <div>
                    <p className="font-medium">Putting the story in order</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Gathering the original post and published replies.
                    </p>
                  </div>
                </div>
              ) : catchUpError ? (
                <div className="flex min-h-[45dvh] flex-col items-center justify-center gap-3 text-center">
                  <p className="font-medium">Couldn’t load this story</p>
                  <p className="max-w-sm text-sm text-muted-foreground">{catchUpError}</p>
                  {openId ? (
                    <Button
                      onClick={() => void handleCatchUp(openId)}
                      className="mt-2 rounded-full"
                    >
                      Try again
                    </Button>
                  ) : null}
                </div>
              ) : storyTimeline ? (
                <>
                  <section className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.11] via-card to-secondary/40 p-5 sm:p-7">
                    <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                      <Sparkles className="size-3.5" /> The story so far
                    </p>
                    <p className="mt-3 max-w-2xl text-base leading-relaxed sm:text-lg">
                      {storyTimeline.data.summary}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 pt-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        Started {formatTimelineDate(storyTimeline.data.story.created_at)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MessageCircle className="size-3.5" />
                        {formatCount(storyTimeline.data.totalUpdates)}{" "}
                        {storyTimeline.data.totalUpdates === 1 ? "reply" : "replies"}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="size-3.5" />
                        Latest {formatTimelineDate(storyTimeline.data.latestUpdateAt)}
                      </span>
                    </div>
                  </section>

                  <section>
                    <div className="mb-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        From the beginning
                      </p>
                      <h3 className="mt-1 text-lg font-semibold">What happened, in order</h3>
                    </div>
                    <div className="relative space-y-0 before:absolute before:bottom-4 before:left-[11px] before:top-3 before:w-px before:bg-border">
                      <TimelineEntry
                        label="Story shared"
                        date={storyTimeline.data.story.created_at}
                        body={storyTimeline.data.story.body}
                        initial
                      />
                      {storyTimeline.data.timeline.map((entry) => (
                        <TimelineEntry
                          key={entry.id}
                          label={entry.official ? "Official company reply" : "Community reply"}
                          date={entry.created_at}
                          body={entry.body}
                          official={entry.official}
                        />
                      ))}
                      {storyTimeline.data.timeline.length === 0 ? (
                        <p className="ml-8 py-2 text-sm text-muted-foreground">
                          No replies have been posted yet. The original story is the latest update.
                        </p>
                      ) : null}
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border bg-background/95 px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:px-8">
            <div className="mx-auto flex w-full max-w-3xl justify-end">
              {openId ? (
                <Button asChild className="w-full rounded-full sm:w-auto">
                  <Link to="/stories/$id" params={{ id: openId }}>
                    Open full conversation <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function TimelineEntry({
  label,
  date,
  body,
  initial = false,
  official = false,
}: {
  label: string;
  date: string;
  body: string;
  initial?: boolean;
  official?: boolean;
}) {
  return (
    <div className="relative flex gap-3 pb-4 last:pb-0">
      <span
        className={`relative z-10 mt-1 flex size-[23px] shrink-0 items-center justify-center rounded-full border-2 border-background ${initial ? "bg-primary text-primary-foreground" : official ? "bg-sky-500 text-white" : "bg-muted text-muted-foreground"}`}
      >
        <CircleDot className="size-3" />
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background/75 p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-xs font-semibold">{label}</p>
          <time className="text-[11px] text-muted-foreground">{formatTimelineDate(date)}</time>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  );
}

function formatTimelineDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
}

function FollowMetric({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2 py-2.5 text-center transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:rounded-xl md:border md:border-border/70 md:bg-secondary/35 md:px-3"
    >
      <p className="text-xl font-semibold tabular-nums" aria-label={value.toLocaleString()}>
        {formatCount(value)}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{label}</p>
    </button>
  );
}

type ProfileStatsView = "followers" | "following" | "stories";

type ConnectionMember = {
  id: string;
  username: string;
  photo_url: string | null;
};

function ProfileStatsDrawer({
  username,
  open,
  initialView,
  followerCount,
  followingCount,
  followedStories,
  onOpenChange,
}: {
  username: string | null;
  open: boolean;
  initialView: ProfileStatsView | null;
  followerCount: number;
  followingCount: number;
  followedStories: FollowedStoryRow[];
  onOpenChange: (open: boolean) => void;
}) {
  const fetchConnections = useServerFn(getPublicProfileConnections);
  const [view, setView] = useState<ProfileStatsView>("followers");
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [members, setMembers] = useState<ConnectionMember[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const cursor = cursorHistory.at(-1) ?? null;

  useEffect(() => {
    if (!open || (view !== "followers" && view !== "following") || !username) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void fetchConnections({ data: { username, kind: view, cursor } })
      .then((page) => {
        if (cancelled) return;
        setMembers(page.members as ConnectionMember[]);
        setHasMore(page.hasMore);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cursor, fetchConnections, open, retry, username, view]);

  useEffect(() => {
    if (!open || !initialView) return;
    setView(initialView);
    setCursorHistory([null]);
    setMembers([]);
    setNextCursor(null);
    setHasMore(false);
    setLoadError(false);
  }, [initialView, open]);

  function changeView(nextView: ProfileStatsView) {
    setView(nextView);
    setCursorHistory([null]);
    setMembers([]);
    setNextCursor(null);
    setHasMore(false);
    setLoadError(false);
  }

  const tabs: { id: ProfileStatsView; label: string; count: number }[] = [
    { id: "followers", label: "Followers", count: followerCount },
    { id: "following", label: "Following", count: followingCount },
    { id: "stories", label: "Stories", count: followedStories.length },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        overlayClassName="!z-[100]"
        className="!inset-0 !bottom-0 !z-[101] !mt-0 !h-[100dvh] !max-h-[100dvh] !rounded-none !border-0 !p-0 [&>div:first-child]:hidden"
      >
        <DrawerTitle className="sr-only">Your profile stats</DrawerTitle>
        <DrawerDescription className="sr-only">
          Browse your followers, following list, and followed stories.
        </DrawerDescription>
        <div className="flex h-full min-h-0 flex-col bg-background">
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              {view === "stories" ? (
                <FileText className="size-5" />
              ) : (
                <UsersRound className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold">
                {view === "stories"
                  ? "Stories you follow"
                  : view === "followers"
                    ? "Followers"
                    : "Following"}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {username ? `@${username}` : "Your Candid activity"}
              </p>
            </div>
            <DrawerClose asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-10 rounded-full"
                aria-label="Close"
              >
                <CloseIcon className="size-4" />
              </Button>
            </DrawerClose>
          </header>

          <nav className="grid shrink-0 grid-cols-3 border-b border-border px-3 sm:px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => changeView(tab.id)}
                aria-pressed={view === tab.id}
                className={`min-h-12 border-b-2 px-2 text-sm transition-colors ${
                  view === tab.id
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label} <span className="text-xs">{formatCount(tab.count)}</span>
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {view === "stories" ? (
              followedStories.length ? (
                <ul className="divide-y divide-border px-4 sm:px-6">
                  {followedStories.map((story) => (
                    <li key={story.story_id}>
                      <Link
                        to="/stories/$id"
                        params={{ id: story.story_id }}
                        onClick={() => onOpenChange(false)}
                        className="flex min-h-16 items-center gap-3 py-3"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <MessageCircle className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {story.title ?? "Untitled story"}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {story.company_name ?? "Unknown company"}
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="grid min-h-56 place-items-center px-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    You aren’t following any stories yet.
                  </p>
                </div>
              )
            ) : loading ? (
              <div className="grid min-h-56 place-items-center text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Loading {view}…
                </span>
              </div>
            ) : loadError ? (
              <div className="grid min-h-56 place-items-center px-6 text-center">
                <div>
                  <p className="text-sm font-medium">This list couldn’t load.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setRetry((count) => count + 1)}
                  >
                    Try again
                  </Button>
                </div>
              </div>
            ) : members.length ? (
              <ul className="divide-y divide-border px-4 sm:px-6">
                {members.map((member) => (
                  <li key={member.id}>
                    <Link
                      to="/u/$username"
                      params={{ username: member.username }}
                      onClick={() => onOpenChange(false)}
                      className="flex min-h-16 items-center gap-3 py-3"
                    >
                      <ProfileAvatar
                        photoUrl={member.photo_url}
                        initials={member.username.slice(0, 2)}
                        className="size-10 shrink-0 border border-border"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        @{member.username}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid min-h-56 place-items-center px-6 text-center text-sm text-muted-foreground">
                No {view} yet.
              </div>
            )}
          </div>

          {view !== "stories" ? (
            <footer className="flex shrink-0 items-center justify-between border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || cursorHistory.length <= 1}
                onClick={() => {
                  setMembers([]);
                  setCursorHistory((history) => history.slice(0, -1));
                }}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {cursorHistory.length}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || !hasMore || !nextCursor}
                onClick={() => {
                  if (!nextCursor) return;
                  setMembers([]);
                  setCursorHistory((history) => [...history, nextCursor]);
                }}
              >
                Next <ArrowRight className="size-4" />
              </Button>
            </footer>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
