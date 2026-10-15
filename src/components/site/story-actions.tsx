import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowBigUp, Flag, Loader2, MessageSquare, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { notify as toast } from "@/lib/notifications-store";
import { addComment, castVote } from "@/lib/actions.functions";
import { ReportDialog } from "@/components/site/report-dialog";
import { CommentThread } from "@/components/site/comment-thread";
import { getStory } from "@/lib/public.functions";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDate } from "@/components/site/story-card";
import { StorySocial } from "@/components/site/story-social";
import { cn, formatCount } from "@/lib/utils";
import { MembershipBadge } from "@/components/site/membership-badge";

/** Inline vote + comment bar so people can act without leaving the feed. */
export function StoryActions({
  storyId,
  upvotes,
  metoo,
  commentCount,
  likes,
  followers,
  discussionOpen = false,
  onToggleDiscussion,
}: {
  storyId: string;
  upvotes: number;
  metoo: number;
  commentCount: number;
  likes?: number;
  followers?: number;
  discussionOpen?: boolean;
  onToggleDiscussion?: (() => void) | undefined;
}) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const vote = useServerFn(castVote);
  const comment = useServerFn(addComment);
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [body, setBody] = useState("");
  const [optimistic, setOptimistic] = useState<{ up: number; metoo: number; comments: number }>({
    up: 0,
    metoo: 0,
    comments: 0,
  });

  const thread = useQuery({
    queryKey: ["story", storyId],
    queryFn: () => getStory({ data: { id: storyId } }),
    enabled: open || sheetOpen || discussionOpen,
  });

  const voteMutation = useMutation({
    mutationFn: (kind: "up" | "metoo") => vote({ data: { story_id: storyId, kind } }),
    onSuccess: (result, kind) => {
      const delta = result?.voted ? 1 : -1;
      setOptimistic((prev) => ({
        ...prev,
        up: kind === "up" ? prev.up + delta : prev.up,
        metoo: kind === "metoo" ? prev.metoo + delta : prev.metoo,
      }));
      void queryClient.invalidateQueries({ queryKey: ["story", storyId] });
      void queryClient.invalidateQueries({ queryKey: ["stories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const commentMutation = useMutation({
    mutationFn: () => comment({ data: { story_id: storyId, parent_id: null, body } }),
    onSuccess: () => {
      setBody("");
      setOptimistic((prev) => ({ ...prev, comments: prev.comments + 1 }));
      void queryClient.invalidateQueries({ queryKey: ["story", storyId] });
      void queryClient.invalidateQueries({ queryKey: ["stories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stop = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <div onClick={stop} className="relative z-10">
      <div className="mt-3 grid grid-cols-6 items-center gap-1 border-t border-border pt-3 sm:flex sm:flex-wrap sm:gap-1.5">
        <ActionChip
          icon={<ArrowBigUp className="size-4 text-primary" />}
          label={formatCount(upvotes + optimistic.up)}
          ariaLabel={`${(upvotes + optimistic.up).toLocaleString()} upvotes`}
          hint="Upvote"
          disabled={!user || voteMutation.isPending}
          onClick={() => voteMutation.mutate("up")}
        />
        <ActionChip
          icon={<Users className="size-4" />}
          label={formatCount(metoo + optimistic.metoo)}
          ariaLabel={`${(metoo + optimistic.metoo).toLocaleString()} people said this happened to them too`}
          hint="This happened to me too"
          disabled={!user || voteMutation.isPending}
          onClick={() => voteMutation.mutate("metoo")}
        />
        <ActionChip
          icon={<MessageSquare className="size-4" />}
          label={formatCount(commentCount + optimistic.comments)}
          ariaLabel={`${(commentCount + optimistic.comments).toLocaleString()} comments`}
          hint="Comments"
          active={discussionOpen || open || sheetOpen}
          onClick={() => {
            if (isMobile || !window.matchMedia("(min-width: 1024px)").matches) {
              setSheetOpen(true);
            } else if (onToggleDiscussion) {
              onToggleDiscussion();
            } else {
              setOpen((value) => !value);
            }
          }}
        />
        <StorySocial
          storyId={storyId}
          likes={likes ?? 0}
          followers={followers ?? 0}
          className="contents sm:flex"
        />

        <ActionChip
          icon={<Flag className="size-4" />}
          label={reported ? "Reported" : ""}
          hint={reported ? "Already reported" : "Report"}
          disabled={!user || reported}
          className="text-danger sm:ml-auto"
          onClick={() => setReportOpen(true)}
        />
      </div>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType="story"
        targetId={storyId}
        onReported={() => setReported(true)}
      />

      {open ? (
        <div className="animate-fade mt-3 space-y-3 border-t border-border/70 pt-3">
          {user ? (
            <div className="space-y-2">
              <Textarea
                rows={2}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Add context or share what happened to you. No names of individuals."
                className="bg-background"
              />
              <Button
                size="sm"
                disabled={body.trim().length < 2 || commentMutation.isPending}
                onClick={() => commentMutation.mutate()}
              >
                {commentMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Post comment
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Link to="/auth" className="font-medium text-primary">
                Sign in
              </Link>{" "}
              to vote or comment. Your identity is never shown.
            </p>
          )}

          {thread.isPending ? (
            <p className="text-xs text-muted-foreground">Loading comments…</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {(thread.data?.comments ?? []).slice(0, 4).map((item) => (
                <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                    {item.author_username ? (
                      <>
                        <Link
                          to="/u/$username"
                          params={{ username: item.author_username }}
                          onClick={(event) => event.stopPropagation()}
                          className="hover:text-primary"
                        >
                          @{item.author_username}
                        </Link>
                        <MembershipBadge
                          tier={item.author_membership_tier}
                          official={item.author_username?.toLowerCase() === "candid"}
                        />
                      </>
                    ) : (
                      item.author_handle
                    )}
                    <span>· {formatDate(item.created_at)}</span>
                  </p>
                  <p className="mt-1 break-words text-sm leading-relaxed">{item.body}</p>
                </li>
              ))}
              {(thread.data?.comments?.length ?? 0) === 0 ? (
                <li className="text-xs text-muted-foreground">
                  No comments yet — be the first voice.
                </li>
              ) : null}
              {(thread.data?.comments?.length ?? 0) > 4 ? (
                <li>
                  <Link
                    to="/stories/$id"
                    params={{ id: storyId }}
                    className="text-xs font-medium text-primary"
                  >
                    View all {formatCount(thread.data?.commentTotal ?? commentCount)} comments
                  </Link>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}

      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="border-b border-border pb-3 text-left">
            <DrawerTitle className="text-sm">Comments</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto">
            {thread.isPending ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Loading comments…
              </p>
            ) : (
              <CommentThread
                storyId={storyId}
                comments={thread.data?.comments ?? []}
                total={commentCount + optimistic.comments}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function ActionChip({
  icon,
  label,
  hint,
  ariaLabel,
  onClick,
  disabled,
  active,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  ariaLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={hint}
      aria-label={ariaLabel ?? hint}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg border border-transparent px-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-all hover:border-border hover:bg-secondary hover:text-foreground active:scale-95 disabled:opacity-50 sm:w-auto sm:rounded-full sm:px-2.5",
        active && "border-primary/40 bg-primary/10 text-foreground",
        className,
      )}
    >
      {icon}
      {label}
    </button>
  );
}
