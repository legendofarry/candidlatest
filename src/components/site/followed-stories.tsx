import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "motion/react";
import { Bookmark, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getFollowStats,
  getFollowedStories,
  getStoryCatchUp,
  markStoryCaughtUp,
} from "@/lib/social.functions";
import { notify as toast } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";

/** Followers/following counts plus followed stories with an AI catch-up. */
export function FollowedStories() {
  const { user } = useAuth();
  const statsFn = useServerFn(getFollowStats);
  const listFn = useServerFn(getFollowedStories);
  const catchUpFn = useServerFn(getStoryCatchUp);
  const seenFn = useServerFn(markStoryCaughtUp);

  const [openId, setOpenId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ id: string; text: string } | null>(null);
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
    try {
      const result = await catchUpFn({ data: { story_id: storyId } });
      setSummary({ id: storyId, text: result.summary });
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
    <section className="glass-card animate-rise rounded-2xl border border-border p-5">
      <div className="flex items-center gap-4">
        <div className="text-sm">
          <span className="font-semibold">{stats.data?.followers ?? 0}</span>{" "}
          <span className="text-muted-foreground">followers</span>
        </div>
        <div className="text-sm">
          <span className="font-semibold">{stats.data?.following ?? 0}</span>{" "}
          <span className="text-muted-foreground">following</span>
        </div>
        <div className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bookmark className="size-4" /> {list.length} followed stories
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {stories.isPending ? (
          <li className="text-xs text-muted-foreground">Loading followed stories…</li>
        ) : list.length === 0 ? (
          <li className="text-xs text-muted-foreground">
            Follow a story from the feed to track how it unfolds.
          </li>
        ) : null}

        {list.map((item) => (
          <li key={item.story_id} className="rounded-xl border border-border bg-card/60 p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  to="/stories/$id"
                  params={{ id: item.story_id }}
                  className="line-clamp-2 text-sm font-medium hover:text-primary"
                >
                  {item.title ?? "Untitled story"}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.company_name ?? "Unknown company"} ·{" "}
                  {item.new_comments > 0
                    ? `${item.new_comments} new since you last looked`
                    : "no new activity"}
                </p>
              </div>
              <Button
                size="sm"
                variant={item.new_comments > 0 ? "default" : "outline"}
                disabled={loadingId === item.story_id}
                onClick={() => void handleCatchUp(item.story_id)}
              >
                {loadingId === item.story_id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Catch me up
              </Button>
            </div>

            <AnimatePresence initial={false}>
              {openId === item.story_id && summary?.id === item.story_id ? (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 overflow-hidden rounded-lg bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground"
                >
                  {summary.text}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </li>
        ))}
      </ul>
    </section>
  );
}
