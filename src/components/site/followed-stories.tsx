import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  CircleDot,
  Clock3,
  Loader2,
  MessageCircle,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
    try {
      const result = await catchUpFn({ data: { story_id: storyId } });
      setStoryTimeline({ id: storyId, data: result });
      await seenFn({ data: { story_id: storyId } });
      void stories.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the catch-up");
    } finally {
      setLoadingId(null);
    }
  }

  const list = stories.data ?? [];

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

            <AnimatePresence initial={false}>
              {openId === item.story_id && storyTimeline?.id === item.story_id ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 overflow-hidden"
                >
                  <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-primary/[0.07] via-card to-secondary/30 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                          <Sparkles className="size-3.5" /> Story so far
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-foreground/85">
                          {storyTimeline.data.summary}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Close story timeline"
                        onClick={() => setOpenId(null)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-background hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border/70 py-3 text-xs text-muted-foreground">
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

                    <div className="relative mt-4 space-y-0 before:absolute before:bottom-4 before:left-[11px] before:top-3 before:w-px before:bg-border">
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
                        <p className="ml-8 py-2 text-xs text-muted-foreground">
                          No replies have been posted yet. This is the latest update.
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button asChild size="sm" variant="ghost" className="rounded-full">
                        <Link to="/stories/$id" params={{ id: item.story_id }}>
                          Open full conversation <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.li>
        ))}
      </ul>
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
