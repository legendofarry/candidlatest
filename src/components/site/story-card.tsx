import { Link, useNavigate } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StoryActions } from "@/components/site/story-actions";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { MembershipBadge } from "@/components/site/membership-badge";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { StoryLocationDialog } from "@/components/site/story-location-dialog";
import type { MembershipTier } from "@/lib/membership";

export type PublicStory = {
  id: string | null;
  title: string | null;
  body: string | null;
  company_name: string | null;
  company_slug: string | null;
  company_verified?: boolean;
  role_level: string | null;
  county: string | null;
  area?: string | null;
  workplace_lat?: number | null;
  workplace_lng?: number | null;
  author_id?: string | null;
  tenure: string | null;
  industry: string | null;
  upvotes: number | null;
  likes?: number | null;
  follower_count?: number;
  metoo: number | null;
  comment_count: number | null;
  created_at: string | null;
  reasons: string[] | null;
  would_work_again?: boolean | null;
  author_username?: string | null;
  author_photo_url?: string | null;
  author_membership_tier?: MembershipTier;
  post_type?: "workplace_story" | "announcement";
  media?: {
    url: string;
    resource_type: "image" | "video";
    format: string;
    width?: number | null;
    height?: number | null;
  }[];
};

export function reasonTone(reason: string) {
  return reason === "good exit" ? "verified" : "danger";
}

export function StoryCard({
  story,
  index = 0,
  discussionOpen = false,
  onToggleDiscussion,
}: {
  story: PublicStory;
  index?: number;
  discussionOpen?: boolean;
  onToggleDiscussion?: (() => void) | undefined;
}) {
  const navigate = useNavigate();
  const open = () => {
    if (story.id) void navigate({ to: "/stories/$id", params: { id: story.id } });
  };

  if (story.post_type === "announcement") {
    return (
      <article
        role={story.id ? "link" : undefined}
        tabIndex={story.id ? 0 : undefined}
        onClick={open}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open();
          }
        }}
        className={`animate-rise group cursor-pointer border-b border-border/70 px-3 py-6 transition-colors hover:bg-secondary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5 ${discussionOpen ? "bg-primary/[0.03]" : ""}`}
        style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
      >
        <header className="flex items-center gap-3">
          <ProfileAvatar
            initials="C"
            photoUrl={story.author_photo_url}
            className="size-11 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              Candid{" "}
              <span className="text-primary" aria-label="Official account">
                ✓
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Update
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              @candid · {formatDate(story.created_at)}
            </p>
          </div>
        </header>
        {story.body ? (
          <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed">{story.body}</p>
        ) : null}
        {story.media?.length ? (
          <div
            className={`mt-4 grid gap-1.5 overflow-hidden rounded-2xl bg-secondary ${story.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
            onClick={(event) => event.stopPropagation()}
          >
            {story.media.map((media, mediaIndex) => (
              <div
                key={`${media.url}-${mediaIndex}`}
                className="relative overflow-hidden bg-black/5"
              >
                {media.resource_type === "video" ? (
                  <video
                    src={media.url}
                    controls
                    playsInline
                    className="max-h-[70vh] min-h-40 w-full object-contain"
                  />
                ) : (
                  <img
                    src={media.url}
                    alt={`Candid update attachment ${mediaIndex + 1}`}
                    loading="lazy"
                    className={`w-full object-cover ${story.media!.length === 1 ? "max-h-[70vh] min-h-40 object-contain" : "aspect-square"}`}
                  />
                )}
              </div>
            ))}
          </div>
        ) : null}
        {story.id ? (
          <StoryActions
            storyId={story.id}
            upvotes={0}
            metoo={0}
            commentCount={story.comment_count ?? 0}
            likes={story.likes ?? 0}
            followers={story.follower_count ?? 0}
            discussionOpen={discussionOpen}
            onToggleDiscussion={onToggleDiscussion}
            announcement
          />
        ) : null}
      </article>
    );
  }

  return (
    <article
      role={story.id ? "link" : undefined}
      tabIndex={story.id ? 0 : undefined}
      onClick={open}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      className={`animate-rise group cursor-pointer border-b border-border/70 px-3 py-6 transition-colors hover:bg-secondary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5 ${discussionOpen ? "bg-primary/[0.03]" : ""}`}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {story.company_slug ? (
          <Link
            to="/companies/$slug"
            params={{ slug: story.company_slug }}
            onClick={(event) => event.stopPropagation()}
            className="relative z-10 inline-flex items-center gap-0.5 font-semibold leading-none text-foreground hover:text-primary"
          >
            {story.company_name}
            {story.company_verified ? <CompanyVerifiedBadge /> : null}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 font-semibold leading-none text-foreground">
            {story.company_name}
            {story.company_verified ? <CompanyVerifiedBadge /> : null}
          </span>
        )}
        <span>·</span>
        <span>{story.industry}</span>
        {story.id ? (
          <StoryLocationDialog
            storyId={story.id}
            county={story.county}
            area={story.area ?? null}
            initialCoordinates={
              typeof story.workplace_lat === "number" && typeof story.workplace_lng === "number"
                ? { lat: story.workplace_lat, lng: story.workplace_lng }
                : null
            }
            authorId={story.author_id ?? null}
          />
        ) : (
          <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{story.county}{story.area ? ` · ${story.area}` : ""}</span>
        )}
        {story.tenure ? <span>· {story.tenure}</span> : null}
        {story.role_level ? <span>· {story.role_level}</span> : null}
      </div>

      <h3 className="mt-2 text-lg font-semibold leading-snug">{story.title}</h3>

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
          {story.author_username ? (
            <>
              <Link
                to="/u/$username"
                params={{ username: story.author_username }}
                onClick={(event) => event.stopPropagation()}
                className="relative z-10 hover:text-primary"
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
        </span>
      </div>

      {story.id ? (
        <StoryActions
          storyId={story.id}
          upvotes={story.upvotes ?? 0}
          metoo={story.metoo ?? 0}
          commentCount={story.comment_count ?? 0}
          likes={story.likes ?? 0}
          followers={story.follower_count ?? 0}
          discussionOpen={discussionOpen}
          onToggleDiscussion={onToggleDiscussion}
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
