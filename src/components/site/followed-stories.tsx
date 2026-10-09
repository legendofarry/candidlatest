import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  CircleDot,
  Clock3,
  Loader2,
  MessageCircle,
  Sparkles,
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

/** Followers/following counts plus followed stories with an AI catch-up. */
export function FollowedStories() {
  const { user } = useAuth();
  const statsFn = useServerFn(getFollowStats);
  const listFn = useServerFn(getFollowedStories);
  const catchUpFn = useServerFn(getStoryCatchUp);
  const seenFn = useServerFn(markStoryCaughtUp);

  const [openId, setOpenId] = useState<string | null>(null);
  const [storyTimeline, setStoryTimeline] = useState<StoryTimeline | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [catchUpError, setCatchUpError] = useState<string | null>(null);

  const stats = useQuery({
    queryKey: ["follow-stats", user?.uid ?? null],
    queryFn: () => statsFn({ data: { user_id: null } }),
    enabled: Boolean(user),
  });

  const stories = useQuery({
    queryKey: ["followed-stories", user?.uid ?? null],
    queryFn: () => listFn(),
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

  const list = stories.data ?? [];
  const selectedStory = list.find((item) => item.story_id === openId) ?? null;

  return (
    <section className="animate-rise border-b border-border pb-5 md:glass-card md:rounded-2xl md:border md:border-border md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bookmark className="size-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Your activity
          </p>
          <h2 className="mt-0.5 font-display text-lg font-semibold">Your story follow-up</h2>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x divide-border md:gap-2 md:divide-x-0">
        <FollowMetric label="Followers" value={stats.data?.followers ?? 0} />
        <FollowMetric label="Following" value={stats.data?.following ?? 0} />
        <FollowMetric label="Stories" value={list.length} />
      </div>

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

        {list.map((item, index) => (
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
                  </span> ·{" "}
                  {item.new_comments > 0
                    ? `${item.new_comments} ${item.new_comments === 1 ? "new reply" : "new replies"} · ${item.total_comments} total`
                    : `${item.total_comments} ${item.total_comments === 1 ? "reply" : "replies"} · up to date`}
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
                {storyTimeline?.data.story.company_name ?? selectedStory?.company_name ?? "Your followed story"}
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
                    <p className="mt-1 text-sm text-muted-foreground">Gathering the original post and published replies.</p>
                  </div>
                </div>
              ) : catchUpError ? (
                <div className="flex min-h-[45dvh] flex-col items-center justify-center gap-3 text-center">
                  <p className="font-medium">Couldn’t load this story</p>
                  <p className="max-w-sm text-sm text-muted-foreground">{catchUpError}</p>
                  {openId ? (
                    <Button onClick={() => void handleCatchUp(openId)} className="mt-2 rounded-full">
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
                        {storyTimeline.data.totalUpdates} {storyTimeline.data.totalUpdates === 1 ? "reply" : "replies"}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="size-3.5" />
                        Latest {formatTimelineDate(storyTimeline.data.latestUpdateAt)}
                      </span>
                    </div>
                  </section>

                  <section>
                    <div className="mb-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">From the beginning</p>
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

function FollowMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-2.5 text-center md:rounded-xl md:border md:border-border/70 md:bg-secondary/35 md:px-3">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
