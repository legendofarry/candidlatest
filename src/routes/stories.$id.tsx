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
import { castVote, getMyEngagement } from "@/lib/actions.functions";
import { formatDate, reasonTone } from "@/components/site/story-card";
import { CommentThread, type ThreadComment } from "@/components/site/comment-thread";
import { ReportDialog } from "@/components/site/report-dialog";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StorySocial } from "@/components/site/story-social";


const storyQuery = (id: string) =>
  queryOptions({ queryKey: ["story", id], queryFn: () => getStory({ data: { id } }) });

export const Route = createFileRoute("/stories/$id")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(storyQuery(params.id));
    if (!data) throw notFound();
    return { title: data.story.title, company: data.story.company_name, body: data.story.body };
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
  const { data } = useSuspenseQuery(storyQuery(id));
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const vote = useServerFn(castVote);
  const engagementFn = useServerFn(getMyEngagement);
  const [reportOpen, setReportOpen] = useState(false);
  const [locallyReported, setLocallyReported] = useState(false);

  const engagement = useQuery({
    queryKey: ["engagement", id, user?.uid ?? "anon"],
    queryFn: () => engagementFn({ data: { story_id: id } }),
    enabled: Boolean(user),
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
  const { story, comments } = data;
  const isReported =
    locallyReported || (engagement.data?.reportedTargetIds ?? []).includes(id);
  const votedKinds = engagement.data?.votedKinds ?? [];

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <div className="animate-fade">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {story.company_slug ? (
            <Link
              to="/companies/$slug"
              params={{ slug: story.company_slug }}
              className="font-semibold text-foreground hover:text-primary"
            >
              {story.company_name}
            </Link>
          ) : null}
          <span>· {story.industry}</span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" /> {story.county}
          </span>
          <span>· {story.tenure}</span>
          <span>· {story.role_level}</span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-4xl">{story.title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {story.author_username ? `@${story.author_username}` : "Anonymous contributor"} ·{" "}
          {formatDate(story.created_at)}
        </p>
      </div>

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

      <div className="whitespace-pre-line rounded-2xl border border-border bg-card p-6 leading-relaxed">
        {story.body}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={votedKinds.includes("up") ? "default" : "outline"}
          disabled={!user || voteMutation.isPending}
          onClick={() => voteMutation.mutate("up")}
        >
          <ArrowBigUp className="size-4" /> Upvote {story.upvotes ?? 0}
        </Button>
        <Button
          variant={votedKinds.includes("metoo") ? "default" : "outline"}
          disabled={!user || voteMutation.isPending}
          onClick={() => voteMutation.mutate("metoo")}
        >
          <Users className="size-4" /> This happened to me too {story.metoo ?? 0}
        </Button>
        <StorySocial storyId={id} />
        <Button

          variant="ghost"
          className="ml-auto text-danger"
          disabled={!user || isReported}
          onClick={() => setReportOpen(true)}
        >
          <Flag className="size-4" /> {isReported ? "Reported" : "Report"}
        </Button>
      </div>

      {!user ? (
        <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
          <Link to="/auth" className="font-medium text-primary">
            Sign in
          </Link>{" "}
          to upvote, add “me too” or comment.
        </p>
      ) : null}

      <CommentThread storyId={id} comments={comments} total={countComments(comments)} />

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
    </article>
  );
}

function countComments(list: ThreadComment[]): number {
  return list.reduce((total, item) => total + 1 + countComments(item.replies), 0);
}
