import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowBigUp, Flag, Loader2, MessageSquare, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { notify as toast } from "@/lib/notifications-store";
import { addComment, castVote } from "@/lib/actions.functions";
import { ReportDialog } from "@/components/site/report-dialog";
import { getStory } from "@/lib/public.functions";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/components/site/story-card";
import { StorySocial } from "@/components/site/story-social";
import { cn } from "@/lib/utils";


/** Inline vote + comment bar so people can act without leaving the feed. */
export function StoryActions({
  storyId,
  upvotes,
  metoo,
  commentCount,
}: {
  storyId: string;
  upvotes: number;
  metoo: number;
  commentCount: number;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const vote = useServerFn(castVote);
  const comment = useServerFn(addComment);
  const [open, setOpen] = useState(false);
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
    enabled: open,
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
      toast.success("Comment posted anonymously");
      void queryClient.invalidateQueries({ queryKey: ["story", storyId] });
      void queryClient.invalidateQueries({ queryKey: ["stories"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stop = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <div onClick={stop} className="relative z-10">
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <ActionChip
          icon={<ArrowBigUp className="size-4 text-primary" />}
          label={`${upvotes + optimistic.up}`}
          hint="Upvote"
          disabled={!user || voteMutation.isPending}
          onClick={() => voteMutation.mutate("up")}
        />
        <ActionChip
          icon={<Users className="size-4" />}
          label={`${metoo + optimistic.metoo} me too`}
          hint="This happened to me too"
          disabled={!user || voteMutation.isPending}
          onClick={() => voteMutation.mutate("metoo")}
        />
        <ActionChip
          icon={<MessageSquare className="size-4" />}
          label={`${commentCount + optimistic.comments}`}
          hint="Comments"
          active={open}
          onClick={() => setOpen((value) => !value)}
        />
        <StorySocial storyId={storyId} />

        <ActionChip
          icon={<Flag className="size-4" />}
          label={reported ? "Reported" : ""}
          hint={reported ? "Already reported" : "Report"}
          disabled={!user || reported}
          className="ml-auto text-danger"
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
        <div className="animate-fade mt-3 space-y-3 rounded-xl bg-secondary/40 p-3">
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
                Post anonymously
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
            <ul className="space-y-2">
              {(thread.data?.comments ?? []).slice(0, 4).map((item) => (
                <li key={item.id} className="rounded-lg bg-background/80 p-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {item.author_handle} · {formatDate(item.created_at)}
                  </p>
                  <p className="mt-1 text-sm">{item.body}</p>
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
                    View all {thread.data?.comments?.length} comments
                  </Link>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ActionChip({
  icon,
  label,
  hint,
  onClick,
  disabled,
  active,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={hint}
      aria-label={hint}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-border hover:bg-secondary hover:text-foreground active:scale-95 disabled:opacity-50",
        active && "border-primary/40 bg-primary/10 text-foreground",
        className,
      )}
    >
      {icon}
      {label}
    </button>
  );
}
