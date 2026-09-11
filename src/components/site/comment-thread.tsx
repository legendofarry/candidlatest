import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  ChevronDown,
  CornerDownRight,
  Heart,
  Loader2,
  MoreHorizontal,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReportDialog } from "@/components/site/report-dialog";
import { addComment, getMyEngagement, likeComment } from "@/lib/actions.functions";
import { notify as toast } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export type ThreadComment = {
  id: string;
  body: string;
  created_at: string;
  author_handle: string;
  author_username: string | null;
  author_verified: boolean;
  is_official: boolean;
  likes: number;
  replies: ThreadComment[];
};

function timeAgo(value: string) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

/** TikTok-style comment sheet: official replies pinned, likes, nested replies, per-item menu. */
export function CommentThread({
  storyId,
  comments,
  total,
}: {
  storyId: string;
  comments: ThreadComment[];
  total: number;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const post = useServerFn(addComment);
  const engagementFn = useServerFn(getMyEngagement);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ThreadComment | null>(null);

  const engagement = useQuery({
    queryKey: ["engagement", storyId, user?.uid ?? "anon"],
    queryFn: () => engagementFn({ data: { story_id: storyId } }),
    enabled: Boolean(user),
  });

  const liked = useMemo(
    () => new Set(engagement.data?.likedCommentIds ?? []),
    [engagement.data?.likedCommentIds],
  );
  const reported = useMemo(
    () => new Set(engagement.data?.reportedTargetIds ?? []),
    [engagement.data?.reportedTargetIds],
  );

  const commentMutation = useMutation({
    mutationFn: () =>
      post({ data: { story_id: storyId, parent_id: replyTo?.id ?? null, body } }),
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      toast.success("Comment posted");
      void queryClient.invalidateQueries({ queryKey: ["story", storyId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{total} comments</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Official replies pinned first
        </span>
      </header>

      <div className="divide-y divide-border/60">
        <AnimatePresence initial={false}>
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              storyId={storyId}
              depth={0}
              liked={liked}
              reported={reported}
              onReply={setReplyTo}
              onChanged={() => {
                void queryClient.invalidateQueries({ queryKey: ["story", storyId] });
                void engagement.refetch();
              }}
            />
          ))}
        </AnimatePresence>
        {comments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No comments yet — be the first voice.
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-0 rounded-b-2xl border-t border-border bg-card/95 p-3 backdrop-blur">
        {user ? (
          <>
            {replyTo ? (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-1.5 text-xs">
                <CornerDownRight className="size-3.5" />
                Replying to {replyTo.author_username ? `@${replyTo.author_username}` : "comment"}
                <button
                  type="button"
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  onClick={() => setReplyTo(null)}
                >
                  Cancel
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <Textarea
                rows={1}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Add a comment…"
                className="min-h-10 resize-none bg-background"
              />
              <Button
                size="icon"
                disabled={body.trim().length < 2 || commentMutation.isPending}
                onClick={() => commentMutation.mutate()}
                aria-label="Post comment"
              >
                {commentMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link to="/auth" className="font-medium text-primary">
              Sign in
            </Link>{" "}
            to like and comment.
          </p>
        )}
      </div>
    </section>
  );
}

function CommentRow({
  comment,
  storyId,
  depth,
  liked,
  reported,
  onReply,
  onChanged,
}: {
  comment: ThreadComment;
  storyId: string;
  depth: number;
  liked: Set<string>;
  reported: Set<string>;
  onReply: (comment: ThreadComment) => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const like = useServerFn(likeComment);
  const [open, setOpen] = useState(depth === 0 && comment.replies.some((r) => r.is_official));
  const [reportOpen, setReportOpen] = useState(false);
  const [localLiked, setLocalLiked] = useState<boolean | null>(null);
  const [localLikes, setLocalLikes] = useState(comment.likes);
  const [localReported, setLocalReported] = useState(false);

  const isLiked = localLiked ?? liked.has(comment.id);
  const isReported = localReported || reported.has(comment.id);
  const initial = (comment.author_username ?? comment.author_handle ?? "?")
    .replace(/^@/, "")
    .charAt(0)
    .toUpperCase();

  const toggleLike = async () => {
    if (!user) return;
    const next = !isLiked;
    setLocalLiked(next);
    setLocalLikes((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      await like({ data: { comment_id: comment.id } });
      onChanged();
    } catch (error) {
      setLocalLiked(!next);
      setLocalLikes((value) => Math.max(0, value + (next ? -1 : 1)));
      toast.error((error as Error).message);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cn("px-4 py-3", depth > 0 && "border-l border-border/60 pl-3")}
      style={{ marginLeft: depth > 0 ? Math.min(depth, 3) * 16 : 0 }}
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            comment.is_official
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-foreground",
          )}
        >
          {initial}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-foreground">
              {comment.author_username ? `@${comment.author_username}` : comment.author_handle}
            </span>
            {comment.author_verified ? <BadgeCheck className="size-3.5 text-primary" /> : null}
            {comment.is_official ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Official reply
              </span>
            ) : null}
            <span className="text-muted-foreground">· {timeAgo(comment.created_at)}</span>
          </div>

          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{comment.body}</p>

          <div className="mt-1.5 flex items-center gap-4 text-[11px] font-medium text-muted-foreground">
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => onReply(comment)}
            >
              Reply
            </button>
            {comment.replies.length > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => setOpen((value) => !value)}
              >
                <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                {open ? "Hide" : `View ${comment.replies.length}`} repl
                {comment.replies.length === 1 ? "y" : "ies"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            aria-label="Like comment"
            disabled={!user}
            onClick={() => void toggleLike()}
            className="text-muted-foreground transition-transform active:scale-90 disabled:opacity-50"
          >
            <Heart
              className={cn("size-4", isLiked && "fill-danger text-danger")}
            />
          </button>
          <span className="text-[10px] text-muted-foreground">{localLikes}</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Comment options"
                className="mt-1 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!user || isReported}
                className="text-danger"
                onSelect={(event) => {
                  event.preventDefault();
                  setReportOpen(true);
                }}
              >
                {isReported ? "Already reported" : "Report comment"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open
          ? comment.replies.map((reply) => (
              <CommentRow
                key={reply.id}
                comment={reply}
                storyId={storyId}
                depth={depth + 1}
                liked={liked}
                reported={reported}
                onReply={onReply}
                onChanged={onChanged}
              />
            ))
          : null}
      </AnimatePresence>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType="comment"
        targetId={comment.id}
        onReported={() => {
          setLocalReported(true);
          onChanged();
        }}
      />
    </motion.div>
  );
}
