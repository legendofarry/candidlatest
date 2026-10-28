import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowBigUp, Users } from "lucide-react";
import { notify as toast } from "@/lib/notifications-store";
import { getStory } from "@/lib/public.functions";
import { cn, formatCount } from "@/lib/utils";
import { castVote, getMyEngagement } from "@/lib/actions.functions";
import {
  FeedPostMenu,
  formatDate,
  reasonTone,
  type PublicStory,
} from "@/components/site/story-card";
import { CommentThread } from "@/components/site/comment-thread";
import { MembershipBadge } from "@/components/site/membership-badge";
import { ReportDialog } from "@/components/site/report-dialog";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StorySocial } from "@/components/site/story-social";
import { StoryLocationDialog } from "@/components/site/story-location-dialog";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { MentionText } from "@/components/site/mention-textarea";

const storyQuery = (id: string) =>
  queryOptions({
    queryKey: ["story", id],
    queryFn: () => getStory({ data: { id } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/stories/$id")({
  validateSearch: (search: Record<string, unknown>): { comment?: string } =>
    typeof search["comment"] === "string" ? { comment: search["comment"] } : {},
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(storyQuery(params.id));
    if (!data) throw notFound();
    return {
      title: data.story.post_type === "announcement" ? "Candid" : data.story.title,
      company: data.story.post_type === "announcement" ? "Community" : data.story.company_name,
      body: data.story.body,
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Story unavailable | Candid" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.title} — ${loaderData.company} | Candid`;
    const description = (loaderData.body ?? "").slice(0, 150);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
      ],
    };
  },
  component: StoryPage,
});

function StoryPage() {
  const { id } = Route.useParams();
  const { comment: focusCommentId } = Route.useSearch();
  const { data } = useSuspenseQuery(storyQuery(id));
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const vote = useServerFn(castVote);
  const engagementFn = useServerFn(getMyEngagement);
  const [reportOpen, setReportOpen] = useState(false);
  const [locallyReported, setLocallyReported] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [voteOverride, setVoteOverride] = useState<{ up: boolean | null; metoo: boolean | null }>({
    up: null,
    metoo: null,
  });

  useEffect(() => {
    const handleScroll = () => setIsCompact(window.scrollY > 180);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isAnnouncement = data?.story.post_type === "announcement";
  const engagement = useQuery({
    queryKey: ["engagement", id, user?.uid ?? "anon"],
    queryFn: () => engagementFn({ data: { story_id: id } }),
    enabled: Boolean(user) && !isAnnouncement,
  });

  const voteMutation = useMutation({
    mutationFn: (kind: "up" | "metoo") => vote({ data: { story_id: id, kind } }),
    onMutate: (kind) => {
      setVoteOverride((current) => {
        const base = engagement.data?.votedKinds.includes(kind) ?? false;
        const voted = current[kind] ?? base;
        return { ...current, [kind]: !voted };
      });
    },
    onSuccess: (result, kind) => {
      setVoteOverride((current) => ({ ...current, [kind]: result.voted }));
      void queryClient.invalidateQueries({ queryKey: ["story", id] });
      void engagement.refetch();
    },
    onError: (error: Error, kind) => {
      setVoteOverride((current) => ({ ...current, [kind]: null }));
      toast.error(error.message);
    },
  });

  if (!data) return null;
  const { story, comments, commentTotal, commentsHasMore, commentsCursor } = data;
  const isReported = locallyReported || (engagement.data?.reportedTargetIds ?? []).includes(id);
  const votedKinds = engagement.data?.votedKinds ?? [];
  const voted = {
    up: voteOverride.up ?? votedKinds.includes("up"),
    metoo: voteOverride.metoo ?? votedKinds.includes("metoo"),
  };

  return (
    <article className={cn("w-full pb-8", !isAnnouncement && "mx-auto max-w-4xl")}>
      <div
        className={cn(
          "sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-md transition-all duration-300",
          isCompact ? "px-4 pb-2 pt-3 sm:px-6" : "px-4 pb-5 pt-5 sm:px-6",
        )}
      >
        {isAnnouncement ? (
          <header className="flex items-center gap-3">
            <ProfileAvatar
              initials="C"
              photoUrl={story.author_photo_url}
              className={cn("size-12 shrink-0 transition-all", isCompact && "size-10")}
            />
            <div>
              <h1 className="sr-only">Candid</h1>
              <p className="font-semibold">Candid</p>
              <p className="text-xs text-muted-foreground">
                Candid · {formatDate(story.created_at)}
              </p>
            </div>
          </header>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {story.company_slug ? (
                <Link
                  to="/companies/$slug"
                  params={{ slug: story.company_slug }}
                  className="font-semibold text-foreground hover:text-primary"
                >
                  {story.company_name}
                  {story.company_verified ? <CompanyVerifiedBadge /> : null}
                </Link>
              ) : null}
              <span>· {story.industry}</span>
              <StoryLocationDialog
                storyId={id}
                county={story.county}
                area={story.area ?? null}
                initialCoordinates={
                  typeof story.workplace_lat === "number" && typeof story.workplace_lng === "number"
                    ? { lat: story.workplace_lat, lng: story.workplace_lng }
                    : null
                }
                authorId={story.author_id ?? null}
              />
              <span>· {story.tenure}</span>
              <span>· {story.role_level}</span>
            </div>
            <h1
              className={cn(
                "mt-3 font-semibold leading-tight transition-all duration-300",
                isCompact ? "text-2xl" : "text-3xl md:text-4xl",
              )}
            >
              {story.title}
            </h1>
            <p
              className={cn(
                "mt-2 text-xs text-muted-foreground transition-all duration-300",
                isCompact && "mt-1.5",
              )}
            >
              {story.author_username ? (
                <>
                  <Link
                    to="/u/$username"
                    params={{ username: story.author_username }}
                    className="hover:text-primary"
                  >
                    @{story.author_username}
                  </Link>
                  <MembershipBadge
                    tier={story.author_membership_tier}
                    official={story.author_username?.toLowerCase() === "candid"}
                  />
                </>
              ) : (
                "Candid member"
              )}{" "}
              · {formatDate(story.created_at)}
            </p>
          </>
        )}
      </div>

      <div className="px-4 py-5 sm:px-6">
        <div className="w-full space-y-6">
          {!isAnnouncement ? (
            <div className="flex flex-wrap gap-1.5">
              {(story.reasons ?? []).map((reason) => (
                <Badge
                  key={reason}
                  variant="outline"
                  className={
                    reasonTone(reason) === "verified"
                      ? "border-verified/40 text-verified"
                      : "border-danger/40 text-danger"
                  }
                >
                  {reason}
                </Badge>
              ))}
            </div>
          ) : null}

          <div
            className={
              isAnnouncement
                ? "whitespace-pre-line text-base leading-relaxed"
                : "whitespace-pre-line py-1 leading-relaxed"
            }
          >
            <MentionText text={story.body ?? ""} />
          </div>

          {isAnnouncement && story.media?.length ? (
            <div
              className={`relative left-1/2 grid w-screen -translate-x-1/2 gap-px overflow-hidden bg-border md:left-auto md:mx-[-1.5rem] md:w-[calc(100%+3rem)] md:translate-x-0 ${story.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
            >
              {story.media.map((media, index) => (
                <div key={`${media.url}-${index}`} className="overflow-hidden bg-background">
                  {media.resource_type === "video" ? (
                    <video
                      src={media.url}
                      controls
                      playsInline
                      className="max-h-[75vh] min-h-40 w-full object-contain"
                    />
                  ) : (
                    <img
                      src={media.url}
                      alt={`Candid attachment ${index + 1}`}
                      className={`w-full ${story.media!.length > 1 ? "aspect-square object-cover" : "max-h-[75vh] min-h-40 object-contain"}`}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <div className="relative flex flex-wrap items-center gap-2">
            {!isAnnouncement ? (
              <DetailAction
                icon={<ArrowBigUp className="size-4" />}
                label={`Upvote ${formatCount(story.upvotes ?? 0)}`}
                active={voted.up}
                disabled={!user}
                onClick={() => voteMutation.mutate("up")}
              />
            ) : null}
            {!isAnnouncement ? (
              <DetailAction
                icon={<Users className="size-4" />}
                label={`This happened to me too ${formatCount(story.metoo ?? 0)}`}
                active={voted.metoo}
                disabled={!user}
                onClick={() => voteMutation.mutate("metoo")}
              />
            ) : null}
            <StorySocial
              storyId={id}
              likes={story.likes ?? 0}
              followers={story.follower_count ?? 0}
              variant={isAnnouncement ? "announcement" : "story"}
            />
            <span className="ml-auto">
              <FeedPostMenu
                story={story as PublicStory}
                userId={user?.uid ?? null}
                onReport={() => setReportOpen(true)}
                reported={isReported}
              />
            </span>
          </div>

          {!user && !isAnnouncement ? (
            <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
              <Link to="/auth" className="font-medium text-primary">
                Sign in
              </Link>{" "}
              to upvote, add “me too” or comment.
            </p>
          ) : null}

          <CommentThread
            storyId={id}
            comments={comments}
            total={commentTotal}
            commentsHasMore={commentsHasMore}
            commentsCursor={commentsCursor}
            focusCommentId={focusCommentId}
            fullWidth
          />
        </div>
      </div>

      {!isAnnouncement ? (
        <ReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          targetType="story"
          targetId={id}
          onReported={() => {
            setLocallyReported(true);
            void engagement.refetch();
          }}
        />
      ) : null}
    </article>
  );
}

function DetailAction({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-lg px-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95 disabled:opacity-50",
        active && "[&_svg]:fill-primary/25 [&_svg]:text-primary",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
