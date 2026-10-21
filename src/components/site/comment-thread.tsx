import { useEffect, useMemo, useState } from "react";
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
  Pencil,
  Send,
  Trash2,
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
import {
  addComment,
  deleteComment,
  editComment,
  getMyEngagement,
  likeComment,
} from "@/lib/actions.functions";
import { getStoryCommentContext, getStoryComments } from "@/lib/public.functions";
import { notify as toast } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatCount } from "@/lib/utils";
import { MembershipBadge } from "@/components/site/membership-badge";
import { useAutoCollapsingCount } from "@/hooks/use-auto-collapsing-count";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { ConfirmDialog } from "@/components/site/confirm-dialog";
import type { MembershipTier } from "@/lib/membership";

export type ThreadComment = {
  id: string;
  body: string;
  created_at: string;
  author_handle: string;
  author_id?: string | null;
  parent_id?: string | null;
  author_username: string | null;
  author_photo_url?: string | null;
  author_verified: boolean;
  author_membership_tier?: MembershipTier;
  is_official: boolean;
  likes: number;
  is_deleted?: boolean;
  edited_at?: string;
  replies: ThreadComment[];
};

export type CommentSortMode = "top" | "newest" | "helpful";

function collectCommentIds(comments: ThreadComment[]): string[] {
  return comments.flatMap((comment) => [comment.id, ...collectCommentIds(comment.replies)]);
}

function mergeCommentPages(current: ThreadComment[], incoming: ThreadComment[]) {
  const flatten = (items: ThreadComment[]): ThreadComment[] =>
    items.flatMap((item) => [item, ...flatten(item.replies)]);
  const byId = new Map<string, ThreadComment>();
  for (const item of [...flatten(current), ...flatten(incoming)]) {
    byId.set(item.id, { ...item, replies: [] });
  }
  const roots: ThreadComment[] = [];
  for (const item of byId.values()) {
    const parent = item.parent_id ? byId.get(item.parent_id) : null;
    if (parent) parent.replies.push(item);
    else roots.push(item);
  }
  return roots;
}

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
  commentsHasMore = false,
  commentsCursor = null,
  focusCommentId,
  sortMode = "top",
  panelMode = false,
  fitContent = false,
  fullWidth = false,
}: {
  storyId: string;
  comments: ThreadComment[];
  total: number;
  commentsHasMore?: boolean;
  commentsCursor?: { createdAt: string; id: string } | null;
  /** Deep-linked comment (from a mention notification) to reveal and scroll to. */
  focusCommentId?: string | undefined;
  sortMode?: CommentSortMode;
  panelMode?: boolean;
  /** Render comments as a full-width section on the story page, without a card frame. */
  fullWidth?: boolean;
  /** Let short mobile sheets size to their comments, with a capped scroll region for long threads. */
  fitContent?: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const post = useServerFn(addComment);
  const engagementFn = useServerFn(getMyEngagement);
  const fetchComments = useServerFn(getStoryComments);
  const [loadedComments, setLoadedComments] = useState(comments);
  const [nextCommentsCursor, setNextCommentsCursor] = useState(commentsCursor);
  const [hasMoreComments, setHasMoreComments] = useState(commentsHasMore);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  // The loaded array contains visible top-level comments. Never show a stored
  // counter that is lower than the comments already rendered in this thread.
  const displayedTotal = Math.max(total, loadedComments.length);
  const visibleCommentIds = useMemo(
    () => collectCommentIds(loadedComments).slice(0, 100),
    [loadedComments],
  );
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ThreadComment | null>(null);
  const {
    visibleCount: visibleRootCount,
    expandBy: expandRootComments,
    resetVisibleCount: revealRootCount,
  } = useAutoCollapsingCount(30);

  useEffect(() => {
    setLoadedComments(comments);
    setNextCommentsCursor(commentsCursor);
    setHasMoreComments(commentsHasMore);
  }, [comments, commentsCursor, commentsHasMore]);

  useEffect(() => {
    if (!focusCommentId) return;
    const el = document.getElementById(`comment-${focusCommentId}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("ring-2", "ring-primary/50");
    const timer = setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 4000);
    return () => clearTimeout(timer);
  }, [focusCommentId, loadedComments]);

  async function loadMoreComments() {
    if (!nextCommentsCursor || loadingMoreComments) return;
    setLoadingMoreComments(true);
    try {
      const page = await fetchComments({ data: { id: storyId, cursor: nextCommentsCursor } });
      setLoadedComments((current) => mergeCommentPages(current, page.comments));
      setNextCommentsCursor(page.nextCursor);
      setHasMoreComments(page.hasMore);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load more comments.");
    } finally {
      setLoadingMoreComments(false);
    }
  }

  const engagement = useQuery({
    queryKey: ["engagement", storyId, user?.uid ?? "anon", visibleCommentIds],
    queryFn: () =>
      engagementFn({
        data: { story_id: storyId, comment_ids: visibleCommentIds },
      }),
    enabled: Boolean(user),
  });

  const fetchCommentContext = useServerFn(getStoryCommentContext);
  const focusedCommentIsLoaded = focusCommentId
    ? collectCommentIds(loadedComments).includes(focusCommentId)
    : true;
  const focusedCommentContext = useQuery({
    queryKey: ["story-comment-context", storyId, focusCommentId],
    queryFn: () =>
      fetchCommentContext({ data: { story_id: storyId, comment_id: focusCommentId! } }),
    enabled: Boolean(focusCommentId) && !focusedCommentIsLoaded,
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!focusedCommentContext.data) return;
    setLoadedComments((current) =>
      mergeCommentPages(current, [focusedCommentContext.data as ThreadComment]),
    );
  }, [focusedCommentContext.data]);

  const liked = useMemo(
    () => new Set(engagement.data?.likedCommentIds ?? []),
    [engagement.data?.likedCommentIds],
  );
  const reported = useMemo(
    () => new Set(engagement.data?.reportedTargetIds ?? []),
    [engagement.data?.reportedTargetIds],
  );
  const sortedComments = useMemo(() => {
    const dateOrder = (a: ThreadComment, b: ThreadComment) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return [...loadedComments].sort((a, b) => {
      if (a.is_official !== b.is_official) return a.is_official ? -1 : 1;
      if (sortMode === "newest") return dateOrder(a, b);
      if (sortMode === "helpful") return b.likes - a.likes || dateOrder(a, b);
      const aScore = a.likes + a.replies.length * 2;
      const bScore = b.likes + b.replies.length * 2;
      return bScore - aScore || dateOrder(a, b);
    });
  }, [loadedComments, sortMode]);

  useEffect(() => {
    if (!focusCommentId) return;
    const focusedRootIndex = sortedComments.findIndex((comment) =>
      subtreeContains(comment, focusCommentId),
    );
    if (focusedRootIndex >= visibleRootCount) revealRootCount(focusedRootIndex + 1);
  }, [focusCommentId, revealRootCount, sortedComments, visibleRootCount]);

  const commentMutation = useMutation({
    mutationFn: () => post({ data: { story_id: storyId, parent_id: replyTo?.id ?? null, body } }),
    onSuccess: () => {
      const addedTopLevelComment = replyTo === null;
      setBody("");
      setReplyTo(null);
      void queryClient.invalidateQueries({ queryKey: ["story", storyId] });
      if (addedTopLevelComment) {
        void queryClient.invalidateQueries({ queryKey: ["story-pages"] });
        void queryClient.invalidateQueries({ queryKey: ["stories"] });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card",
        fullWidth && "rounded-none border-x-0 border-y border-border/70 bg-transparent",
        panelMode &&
          !fitContent &&
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-transparent",
        panelMode &&
          fitContent &&
          "flex flex-col overflow-hidden rounded-none border-0 bg-transparent",
      )}
    >
      <header
        className={cn(
          "sticky top-16 z-20 flex items-center gap-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-md",
          fullWidth && "bg-background/95",
          panelMode && "hidden",
        )}
      >
        <h2
          className="text-sm font-semibold"
          aria-label={`${displayedTotal.toLocaleString()} comments`}
        >
          {formatCount(displayedTotal)} comments
        </h2>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Official replies pinned first
        </span>
      </header>

      <div
        className={cn(
          "divide-y divide-border/60",
          panelMode && !fitContent && "min-h-0 flex-1 overflow-y-auto",
          panelMode && fitContent && "max-h-[calc(86dvh-20rem)] overflow-y-auto",
        )}
      >
        {focusCommentId && !focusedCommentIsLoaded ? (
          <p className="px-4 py-3 text-center text-xs text-muted-foreground" role="status">
            {focusedCommentContext.isLoading
              ? "Opening the linked comment…"
              : focusedCommentContext.isError
                ? "Could not load the linked comment."
                : "This comment is no longer available."}
          </p>
        ) : null}
        <AnimatePresence initial={false}>
          {sortedComments.slice(0, visibleRootCount).map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              storyId={storyId}
              depth={0}
              liked={liked}
              reported={reported}
              focusCommentId={focusCommentId}
              onReply={setReplyTo}
              onChanged={() => {
                void queryClient.invalidateQueries({ queryKey: ["story", storyId] });
                void engagement.refetch();
              }}
              onDeleted={() => {
                void Promise.all([
                  queryClient.invalidateQueries({ queryKey: ["story", storyId] }),
                  queryClient.invalidateQueries({ queryKey: ["stories"] }),
                  queryClient.invalidateQueries({ queryKey: ["story-pages"] }),
                  engagement.refetch(),
                ]);
              }}
            />
          ))}
        </AnimatePresence>
        {loadedComments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No comments yet — be the first voice.
          </p>
        ) : null}
      </div>

      {sortedComments.length > visibleRootCount ? (
        <div className="flex flex-col items-center gap-1 border-t border-border/60 p-3 text-center">
          <p className="text-xs text-muted-foreground">
            Showing {formatCount(Math.min(visibleRootCount, sortedComments.length))} of{" "}
            {formatCount(sortedComments.length)} top-level comments
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => expandRootComments(30, event.currentTarget)}
          >
            Show 30 more comments
          </Button>
        </div>
      ) : null}

      {hasMoreComments ? (
        <div className="flex justify-center border-t border-border/60 p-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={loadingMoreComments}
            onClick={() => void loadMoreComments()}
          >
            {loadingMoreComments ? "Loading comments…" : "Load older comments"}
          </Button>
        </div>
      ) : null}

      <div
        className={cn(
          "sticky bottom-0 rounded-b-2xl border-t border-border bg-card/95 p-3 backdrop-blur",
          fullWidth && "rounded-none bg-background/95",
          panelMode && "relative shrink-0 rounded-none",
        )}
      >
        {user ? (
          <>
            {replyTo ? (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-1.5 text-xs">
                <CornerDownRight className="size-3.5" />
                Replying to{" "}
                {replyTo.author_username ? (
                  <>
                    <Link
                      to="/u/$username"
                      params={{ username: replyTo.author_username }}
                      className="font-medium hover:text-primary"
                    >
                      @{replyTo.author_username}
                    </Link>
                    <MembershipBadge
                      tier={replyTo.author_membership_tier}
                      official={replyTo.author_username?.toLowerCase() === "candid"}
                    />
                  </>
                ) : (
                  "comment"
                )}
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

function subtreeContains(comment: ThreadComment, id: string): boolean {
  if (comment.id === id) return true;
  return comment.replies.some((reply) => subtreeContains(reply, id));
}

function CommentRow({
  comment,
  storyId,
  depth,
  liked,
  reported,
  focusCommentId,
  onReply,
  onChanged,
  onDeleted,
}: {
  comment: ThreadComment;
  storyId: string;
  depth: number;
  liked: Set<string>;
  reported: Set<string>;
  focusCommentId?: string | undefined;
  onReply: (comment: ThreadComment) => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { user } = useAuth();
  const like = useServerFn(likeComment);
  const edit = useServerFn(editComment);
  const remove = useServerFn(deleteComment);
  const [open, setOpen] = useState(
    (depth === 0 && comment.replies.some((r) => r.is_official)) ||
      (focusCommentId ? subtreeContains(comment, focusCommentId) : false),
  );
  const [reportOpen, setReportOpen] = useState(false);
  const [localLiked, setLocalLiked] = useState<boolean | null>(null);
  const [localLikes, setLocalLikes] = useState(comment.likes);
  const [localReported, setLocalReported] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedBody, setEditedBody] = useState(comment.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { visibleCount: visibleReplies, expandBy: expandReplies } = useAutoCollapsingCount(10);

  useEffect(() => {
    if (!editing) setEditedBody(comment.body);
  }, [comment.body, editing]);

  const isLiked = localLiked ?? liked.has(comment.id);
  const isReported = localReported || reported.has(comment.id);
  const initial = (comment.author_username ?? comment.author_handle ?? "?")
    .replace(/^@/, "")
    .charAt(0)
    .toUpperCase();

  if (comment.is_deleted) return null;

  const toggleLike = async () => {
    if (!user || comment.is_deleted) return;
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

  async function saveEdit() {
    try {
      await edit({ data: { comment_id: comment.id, body: editedBody } });
      setEditing(false);
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function deleteOwnComment() {
    try {
      await remove({ data: { comment_id: comment.id } });
      setConfirmDelete(false);
      onDeleted();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <motion.div
      id={`comment-${comment.id}`}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cn("px-4 py-3", depth > 0 && "border-l border-border/60 pl-3")}
      style={{ marginLeft: depth > 0 ? Math.min(depth, 3) * 16 : 0 }}
    >
      <div className="flex gap-3">
        <ProfileAvatar
          photoUrl={comment.author_photo_url}
          initials={initial}
          className={cn(
            "mt-0.5 size-8 shrink-0 text-xs",
            comment.is_official && "ring-2 ring-primary/25",
          )}
          fallbackClassName={cn(
            "text-xs",
            comment.is_official
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-foreground",
          )}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {comment.author_username ? (
              <Link
                to="/u/$username"
                params={{ username: comment.author_username }}
                className="font-semibold text-foreground hover:text-primary"
              >
                @{comment.author_username}
              </Link>
            ) : (
              <span className="font-semibold text-foreground">{comment.author_handle}</span>
            )}
            {comment.author_verified ? <BadgeCheck className="size-3.5 text-primary" /> : null}
            <MembershipBadge
              tier={comment.author_membership_tier}
              official={comment.author_username?.toLowerCase() === "candid"}
            />
            {comment.is_official ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Official reply
              </span>
            ) : null}
            <span className="text-muted-foreground">· {timeAgo(comment.created_at)}</span>
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <Textarea
                rows={3}
                maxLength={2000}
                value={editedBody}
                onChange={(event) => setEditedBody(event.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={editedBody.trim().length < 2}
                  onClick={() => void saveEdit()}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">
              {comment.body}
              {comment.edited_at && !comment.is_deleted ? (
                <span className="ml-1 text-xs text-muted-foreground">(edited)</span>
              ) : null}
            </p>
          )}

          <div className="mt-1.5 flex items-center gap-4 text-[11px] font-medium text-muted-foreground">
            <button
              type="button"
              disabled={comment.is_deleted}
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
                <ChevronDown
                  className={cn("size-3.5 transition-transform", open && "rotate-180")}
                />
                {open ? "Hide" : `View ${formatCount(comment.replies.length)}`}{" "}
                {comment.replies.length === 1 ? "reply" : "replies"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          {!comment.is_deleted ? (
            <>
              <button
                type="button"
                aria-label="Like comment"
                disabled={!user}
                onClick={() => void toggleLike()}
                className="text-muted-foreground transition-transform active:scale-90 disabled:opacity-50"
              >
                <Heart className={cn("size-4", isLiked && "fill-danger text-danger")} />
              </button>
              <span
                className="text-[10px] text-muted-foreground"
                aria-label={`${localLikes.toLocaleString()} likes`}
              >
                {formatCount(localLikes)}
              </span>
            </>
          ) : null}

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
              {comment.author_id === user?.uid && !comment.is_deleted ? (
                <>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setEditing(true);
                    }}
                  >
                    <Pencil className="mr-2 size-4" /> Edit comment
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-danger"
                    onSelect={(event) => {
                      event.preventDefault();
                      setConfirmDelete(true);
                    }}
                  >
                    <Trash2 className="mr-2 size-4" /> Delete comment
                  </DropdownMenuItem>
                </>
              ) : (
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
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open
          ? comment.replies
              .slice(0, visibleReplies)
              .map((reply) => (
                <CommentRow
                  key={reply.id}
                  comment={reply}
                  storyId={storyId}
                  depth={depth + 1}
                  liked={liked}
                  reported={reported}
                  focusCommentId={focusCommentId}
                  onReply={onReply}
                  onChanged={onChanged}
                  onDeleted={onDeleted}
                />
              ))
          : null}
      </AnimatePresence>

      {open && comment.replies.length > visibleReplies ? (
        <button
          type="button"
          className="ml-12 mt-1 text-xs font-medium text-primary"
          onClick={(event) => expandReplies(10, event.currentTarget)}
        >
          Show 10 more replies · {formatCount(Math.min(visibleReplies, comment.replies.length))} of{" "}
          {formatCount(comment.replies.length)}
        </button>
      ) : null}

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
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this comment?"
        description="The text will be removed. Replies will stay in the conversation."
        confirmLabel="Delete comment"
        destructive
        onConfirm={() => void deleteOwnComment()}
      />
    </motion.div>
  );
}
