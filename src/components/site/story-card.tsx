import { Link, useNavigate } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StoryActions } from "@/components/site/story-actions";

export type PublicStory = {
  id: string | null;
  title: string | null;
  body: string | null;
  company_name: string | null;
  company_slug: string | null;
  role_level: string | null;
  county: string | null;
  tenure: string | null;
  industry: string | null;
  upvotes: number | null;
  metoo: number | null;
  comment_count: number | null;
  created_at: string | null;
  reasons: string[] | null;
  would_work_again?: boolean | null;
  author_username?: string | null;
};

export function reasonTone(reason: string) {
  return reason === "good exit" ? "verified" : "danger";
}

export function StoryCard({ story, index = 0 }: { story: PublicStory; index?: number }) {
  const navigate = useNavigate();
  const open = () => {
    if (story.id) void navigate({ to: "/stories/$id", params: { id: story.id } });
  };

  return (
    <article
      role={story.id ? "link" : undefined}
      tabIndex={story.id ? 0 : undefined}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      className="animate-rise cursor-pointer rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {story.company_slug ? (
          <Link
            to="/companies/$slug"
            params={{ slug: story.company_slug }}
            onClick={(event) => event.stopPropagation()}
            className="relative z-10 font-semibold text-foreground hover:text-primary"
          >
            {story.company_name}
          </Link>
        ) : (
          <span className="font-semibold text-foreground">{story.company_name}</span>
        )}
        <span>·</span>
        <span>{story.industry}</span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3" />
          {story.county}
        </span>
        {story.tenure ? <span>· {story.tenure}</span> : null}
        {story.role_level ? <span>· {story.role_level}</span> : null}
      </div>

      <h3 className="mt-2 text-lg font-semibold leading-snug">
        {story.title}
      </h3>

      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{story.body}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
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

      <div className="mt-4 flex items-center gap-5 text-xs text-muted-foreground">
        <span className="ml-auto">
          {story.author_username ? `@${story.author_username}` : "Anonymous"} ·{" "}
          {formatDate(story.created_at)}
        </span>
      </div>

      {story.id ? (
        <StoryActions
          storyId={story.id}
          upvotes={story.upvotes ?? 0}
          metoo={story.metoo ?? 0}
          commentCount={story.comment_count ?? 0}
        />
      ) : null}
    </article>
  );
}

export function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
