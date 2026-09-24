import { useState } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, Heart, MessageCircle, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommentThread,
  type CommentSortMode,
  type ThreadComment,
} from "@/components/site/comment-thread";
import type { PublicStory } from "@/components/site/story-card";
import { getStory } from "@/lib/public.functions";
import { cn } from "@/lib/utils";

const sortOptions: { value: CommentSortMode; label: string; icon: typeof TrendingUp }[] = [
  { value: "top", label: "Top", icon: TrendingUp },
  { value: "newest", label: "Newest", icon: Clock3 },
  { value: "helpful", label: "Helpful", icon: Heart },
];

export function FeedDiscussionPanel({
  story,
  onClose,
}: {
  story: PublicStory;
  onClose: () => void;
}) {
  const [sortMode, setSortMode] = useState<CommentSortMode>("top");
  const fetchStory = useServerFn(getStory);
  const thread = useQuery({
    queryKey: ["story", story.id],
    queryFn: () => fetchStory({ data: { id: story.id! } }),
    enabled: Boolean(story.id),
  });
  const comments = thread.data?.comments ?? [];
  const total = thread.data ? countComments(comments) : (story.comment_count ?? 0);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      aria-label="Post discussion"
      className="sticky top-20 flex h-[calc(100dvh-6rem)] min-h-[30rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/10"
    >
      <header className="shrink-0 border-b border-border bg-card/95 p-4 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              <MessageCircle className="size-3.5" /> Discussion · {total}
            </p>
            <h2 className="mt-2 line-clamp-2 text-base font-semibold leading-snug">
              {story.title || "Post discussion"}
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {story.company_name || "Anonymous employer"} · Anonymous
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close discussion">
            <X className="size-4" />
          </Button>
        </div>

        <div
          role="tablist"
          aria-label="Sort comments"
          className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-secondary/60 p-1"
        >
          {sortOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={sortMode === value}
              onClick={() => setSortMode(value)}
              className={cn(
                "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                sortMode === value && "bg-background text-foreground shadow-sm",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-2 py-1">
        {thread.isPending ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
            Loading discussion…
          </div>
        ) : thread.isError ? (
          <p className="p-5 text-sm text-muted-foreground">
            This discussion couldn’t load. Close it and try again.
          </p>
        ) : (
          <CommentThread
            storyId={story.id!}
            comments={comments}
            total={total}
            sortMode={sortMode}
            panelMode
          />
        )}
      </div>
    </motion.aside>
  );
}

function countComments(comments: ThreadComment[]): number {
  return comments.reduce((sum, comment) => sum + 1 + countComments(comment.replies), 0);
}
