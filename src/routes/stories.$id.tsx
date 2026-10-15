import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowBigUp, Flag, MapPin, Users } from "lucide-react";
import { notify as toast } from "@/lib/notifications-store";
import { getStory } from "@/lib/public.functions";
import { formatCount } from "@/lib/utils";
import { castVote, getMyEngagement } from "@/lib/actions.functions";
import { formatDate, reasonTone } from "@/components/site/story-card";
import { CommentThread } from "@/components/site/comment-thread";
import { MembershipBadge } from "@/components/site/membership-badge";
import { ReportDialog } from "@/components/site/report-dialog";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StorySocial } from "@/components/site/story-social";
import { StoryLocationTag } from "@/components/site/company-intel";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { ProfileAvatar } from "@/components/site/profile-photo";

const storyQuery = (id: string) =>
  queryOptions({ queryKey: ["story", id], queryFn: () => getStory({ data: { id } }) });

export const Route = createFileRoute("/stories/$id")({
  validateSearch: (search: Record<string, unknown>): { comment?: string } =>
    typeof search["comment"] === "string" ? { comment: search["comment"] } : {},
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(storyQuery(params.id));
    if (!data) throw notFound();
    return {
      title: data.story.post_type === "announcement" ? "Candid update" : data.story.title,
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

  const isAnnouncement = data?.story.post_type === "announcement";
  const engagement = useQuery({
    queryKey: ["engagement", id, user?.uid ?? "anon"],
    queryFn: () => engagementFn({ data: { story_id: id } }),
    enabled: Boolean(user) && !isAnnouncement,
  });

  const voteMutation = useMutation({
    mutationFn: (kind: "up" | "metoo") => vote({ data: { story_id: id, kind } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["story", id] });
      void engagement.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!data) return null;
  const { story, comments, commentTotal } = data;
  const isReported = locallyReported || (engagement.data?.reportedTargetIds ?? []).includes(id);
  const votedKinds = engagement.data?.votedKinds ?? [];

  return (
    <article className="mx-auto w-full max-w-3xl space-y-6 md:mx-0 md:max-w-none">
      <div className="animate-fade">
        {isAnnouncement ? (
          <header className="flex items-center gap-3 border-b border-border/70 pb-5">
            <ProfileAvatar
              initials="C"
              photoUrl={story.author_photo_url}
              className="size-12 shrink-0"
            />
            <div>
              <h1 className="sr-only">Candid update</h1>
              <p className="font-semibold">
                Candid <span className="text-primary">✓</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Official update · {formatDate(story.created_at)}
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
              {story.company_id ? (
                <StoryLocationTag companyId={story.company_id} county={story.county} />
              ) : (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" /> {story.county}
                </span>
              )}
              {story.area ? <span>· {story.area}</span> : null}
              <span>· {story.tenure}</span>
              <span>· {story.role_level}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-4xl">{story.title}</h1>
            <p className="mt-2 text-xs text-muted-foreground">
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
            : "whitespace-pre-line rounded-2xl border border-border bg-card p-6 leading-relaxed"
        }
      >
        {story.body}
      </div>

      {isAnnouncement && story.media?.length ? (
        <div
          className={`grid gap-2 overflow-hidden rounded-2xl bg-secondary ${story.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {story.media.map((media, index) => (
            <div key={`${media.url}-${index}`} className="overflow-hidden bg-black/5">
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
                  alt={`Candid update attachment ${index + 1}`}
                  className={`w-full ${story.media!.length > 1 ? "aspect-square object-cover" : "max-h-[75vh] min-h-40 object-contain"}`}
                />
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {!isAnnouncement ? (
          <Button
            variant={votedKinds.includes("up") ? "default" : "outline"}
            disabled={!user || voteMutation.isPending}
            onClick={() => voteMutation.mutate("up")}
          >
            <ArrowBigUp className="size-4" /> Upvote {formatCount(story.upvotes ?? 0)}
          </Button>
        ) : null}
        {!isAnnouncement ? (
          <Button
            variant={votedKinds.includes("metoo") ? "default" : "outline"}
            disabled={!user || voteMutation.isPending}
            onClick={() => voteMutation.mutate("metoo")}
          >
            <Users className="size-4" /> This happened to me too {formatCount(story.metoo ?? 0)}
          </Button>
        ) : null}
        <StorySocial
          storyId={id}
          likes={story.likes ?? 0}
          followers={story.follower_count ?? 0}
          variant={isAnnouncement ? "announcement" : "story"}
        />
        {!isAnnouncement ? (
          <Button
            variant="ghost"
            className="ml-auto text-danger"
            disabled={!user || isReported}
            onClick={() => setReportOpen(true)}
          >
            <Flag className="size-4" /> {isReported ? "Reported" : "Report"}
          </Button>
        ) : null}
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
        focusCommentId={focusCommentId}
      />

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
