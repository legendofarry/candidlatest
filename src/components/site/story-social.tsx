import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Heart } from "lucide-react";
import { followStory, getStoryEngagement, likeStory } from "@/lib/social.functions";
import { notify as toast } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/** Like + follow-this-story controls, shared by the feed card and the story page. */
export function StorySocial({ storyId, likes = 0, className }: { storyId: string; likes?: number; className?: string }) {
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
  const [likeCount, setLikeCount] = useState(likes);
  const [likedOverride, setLikedOverride] = useState<boolean | null>(null);
  const [followingOverride, setFollowingOverride] = useState<boolean | null>(null);

  useEffect(() => setLikeCount(engagement.data?.likes ?? likes), [engagement.data?.likes, likes]);
  useEffect(() => setLikedOverride(null), [engagement.data?.liked]);
  useEffect(() => setFollowingOverride(null), [engagement.data?.following]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["story-engagement", storyId] });
    void queryClient.invalidateQueries({ queryKey: ["followed-stories"] });
  };

  const likeMutation = useMutation({
    mutationFn: () => like({ data: { story_id: storyId } }),
    onMutate: () => {
      const next = !liked;
      setLikedOverride(next);
      setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));
      return { previous: likeCount };
    },
    onSuccess: (result) => {
      setLikedOverride(result.liked);
      setLikeCount(result.likes);
      invalidate();
    },
    onError: (error: Error, _variables, context) => {
      setLikedOverride(null);
      if (context) setLikeCount(context.previous);
      toast.error(error.message);
    },
  });

  const followMutation = useMutation({
    mutationFn: () => follow({ data: { story_id: storyId } }),
    onSuccess: (result) => {
      setFollowingOverride(result.following);
      invalidate();
    },
    onMutate: () => setFollowingOverride(!following),
    onError: (error: Error) => {
      setFollowingOverride(null);
      toast.error(error.message);
    },
  });

  const liked = likedOverride ?? Boolean(engagement.data?.liked);
  const following = followingOverride ?? Boolean(engagement.data?.following);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        title={liked ? "Unlike" : "Like"}
        aria-label={liked ? "Unlike" : "Like"}
        disabled={!user || likeMutation.isPending}
        onClick={() => likeMutation.mutate()}
        className={cn(
          "inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-full px-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground active:scale-95 disabled:opacity-50 sm:px-2",
          liked && "text-danger",
        )}
      >
        <Heart className={cn("size-4", liked && "fill-current")} />
        <span>{likeCount}</span>
      </button>
      <button
        type="button"
        title={following ? "Unfollow story" : "Follow story"}
        aria-label={following ? "Unfollow story" : "Follow story"}
        disabled={!user || followMutation.isPending}
        onClick={() => followMutation.mutate()}
        className={cn(
          "inline-flex h-9 min-w-0 items-center justify-center rounded-full px-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground active:scale-95 disabled:opacity-50 sm:px-2",
          following && "text-primary",
        )}
      >
        <Bookmark className={cn("size-4", following && "fill-current")} />
      </button>
    </div>
  );
}
