import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Heart, Share2 } from "lucide-react";
import { followStory, getStoryEngagement, likeStory, saveStory } from "@/lib/social.functions";
import { notify as toast } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatCount } from "@/lib/utils";

/** Like + follow-this-story controls, shared by the feed card and the story page. */
export function StorySocial({
  storyId,
  likes = 0,
  followers = 0,
  className,
  variant = "story",
}: {
  storyId: string;
  likes?: number;
  followers?: number;
  className?: string;
  variant?: "story" | "announcement";
}) {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const queryClient = useQueryClient();
  const like = useServerFn(likeStory);
  const follow = useServerFn(followStory);
  const save = useServerFn(saveStory);
  const engagementFn = useServerFn(getStoryEngagement);

  const engagement = useQuery({
    queryKey: ["story-engagement", storyId, user?.uid ?? "anon"],
    queryFn: () => engagementFn({ data: { story_id: storyId } }),
    enabled: Boolean(user) && nearViewport,
  });
  const [likeCount, setLikeCount] = useState(likes);
  const [followerCount, setFollowerCount] = useState(followers);
  const [likedOverride, setLikedOverride] = useState<boolean | null>(null);
  const [followingOverride, setFollowingOverride] = useState<boolean | null>(null);
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);

  useEffect(() => setLikedOverride(null), [engagement.data?.liked]);
  useEffect(() => setFollowingOverride(null), [engagement.data?.following]);
  useEffect(() => setSavedOverride(null), [engagement.data?.saved]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || nearViewport) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nearViewport]);

  const invalidate = (options: { followChanged?: boolean; feedChanged?: boolean } = {}) => {
    void queryClient.invalidateQueries({ queryKey: ["story-engagement", storyId] });
    if (options.feedChanged) void queryClient.invalidateQueries({ queryKey: ["stories"] });
    if (options.followChanged)
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
      invalidate({ feedChanged: true });
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
      setFollowerCount(result.followers);
      invalidate({ followChanged: true, feedChanged: true });
    },
    onMutate: () => {
      const next = !following;
      setFollowingOverride(next);
      setFollowerCount((count) => Math.max(0, count + (next ? 1 : -1)));
    },
    onError: (error: Error) => {
      setFollowingOverride(null);
      setFollowerCount(followers);
      toast.error(error.message);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { story_id: storyId } }),
    onMutate: () => setSavedOverride(!saved),
    onSuccess: (result) => {
      setSavedOverride(result.saved);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["saved-community-posts"] });
    },
    onError: (error: Error) => {
      setSavedOverride(null);
      toast.error(error.message);
    },
  });

  const liked = likedOverride ?? Boolean(engagement.data?.liked);
  const following = followingOverride ?? Boolean(engagement.data?.following);
  const saved = savedOverride ?? Boolean(engagement.data?.saved);

  async function sharePost() {
    const url = new URL(
      `/stories/${encodeURIComponent(storyId)}`,
      window.location.origin,
    ).toString();
    try {
      if (navigator.share) await navigator.share({ title: "Candid update", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast.error("Could not share this post");
      }
    }
  }

  return (
    <div ref={containerRef} className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        title={liked ? "Unlike" : "Like"}
        aria-label={liked ? "Unlike" : "Like"}
        disabled={!user}
        onClick={() => likeMutation.mutate()}
        className={cn(
          "inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-full px-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground active:scale-95 disabled:opacity-50 sm:px-2",
          liked && "text-danger",
        )}
      >
        <Heart className={cn("size-4", liked && "fill-current")} />
        <span aria-label={`${likeCount.toLocaleString()} likes`}>{formatCount(likeCount)}</span>
      </button>
      <button
        type="button"
        title={
          (variant === "announcement" ? saved : following)
            ? variant === "announcement"
              ? "Remove saved post"
              : "Unfollow story"
            : variant === "announcement"
              ? "Save post"
              : "Follow story"
        }
        aria-label={
          (variant === "announcement" ? saved : following)
            ? variant === "announcement"
              ? "Remove saved post"
              : "Unfollow story"
            : variant === "announcement"
              ? "Save post"
              : "Follow story"
        }
        disabled={!user}
        onClick={() =>
          variant === "announcement" ? saveMutation.mutate() : followMutation.mutate()
        }
        className={cn(
          "inline-flex h-9 min-w-0 items-center justify-center rounded-full px-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground active:scale-95 disabled:opacity-50 sm:px-2",
          (variant === "announcement" ? saved : following) && "text-primary",
        )}
      >
        <Bookmark
          className={cn(
            "size-4",
            (variant === "announcement" ? saved : following) && "fill-current",
          )}
        />
        {variant === "announcement" ? (
          <span>{saved ? "Saved" : "Save"}</span>
        ) : (
          <span aria-label={`${followerCount.toLocaleString()} followers`}>
            {formatCount(followerCount)}
          </span>
        )}
      </button>
      {variant === "announcement" ? (
        <button
          type="button"
          title="Share post"
          aria-label="Share post"
          onClick={() => void sharePost()}
          className="inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-full px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-2"
        >
          <Share2 className="size-4" /> <span>Share</span>
        </button>
      ) : null}
    </div>
  );
}
