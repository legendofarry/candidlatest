import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Heart } from "lucide-react";
import { followStory, getStoryEngagement, likeStory } from "@/lib/social.functions";
import { notify as toast } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/** Like + follow-this-story controls, shared by the feed card and the story page. */
export function StorySocial({ storyId, className }: { storyId: string; className?: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const like = useServerFn(likeStory);
  const follow = useServerFn(followStory);
  const engagementFn = useServerFn(getStoryEngagement);

  const engagement = useQuery({
    queryKey: ["story-engagement", storyId, user?.uid ?? "anon"],
    queryFn: () => engagementFn({ data: { story_id: storyId } }),
    enabled: Boolean(user),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["story-engagement", storyId] });
    void queryClient.invalidateQueries({ queryKey: ["followed-stories"] });
  };

  const likeMutation = useMutation({
    mutationFn: () => like({ data: { story_id: storyId } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const followMutation = useMutation({
    mutationFn: () => follow({ data: { story_id: storyId } }),
    onSuccess: (result) => {
      invalidate();
      toast.success(
        result?.following ? "Following this story — we'll catch you up" : "Unfollowed this story",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const liked = Boolean(engagement.data?.liked);
  const following = Boolean(engagement.data?.following);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        title={liked ? "Unlike" : "Like"}
        aria-label={liked ? "Unlike" : "Like"}
        disabled={!user || likeMutation.isPending}
        onClick={() => likeMutation.mutate()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-border hover:bg-secondary hover:text-foreground active:scale-95 disabled:opacity-50",
          liked && "border-danger/40 bg-danger/10 text-danger",
        )}
      >
        <Heart className={cn("size-4", liked && "fill-current")} />
      </button>
      <button
        type="button"
        title={following ? "Unfollow story" : "Follow story"}
        aria-label={following ? "Unfollow story" : "Follow story"}
        disabled={!user || followMutation.isPending}
        onClick={() => followMutation.mutate()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-border hover:bg-secondary hover:text-foreground active:scale-95 disabled:opacity-50",
          following && "border-primary/40 bg-primary/10 text-foreground",
        )}
      >
        <Bookmark className={cn("size-4", following && "fill-current")} />
        {following ? "Following" : ""}
      </button>
    </div>
  );
}
