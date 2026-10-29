import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  Building2,
  EyeOff,
  Flag,
  MapPin,
  MoreHorizontal,
  Share2,
  UserRoundPlus,
  UserRoundX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StoryActions } from "@/components/site/story-actions";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { MembershipBadge } from "@/components/site/membership-badge";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { MentionText } from "@/components/site/mention-textarea";
import { StoryLocationDialog } from "@/components/site/story-location-dialog";
import { ReportDialog } from "@/components/site/report-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  followAccount,
  getAccountRelationship,
  updateFeedPreference,
} from "@/lib/social.functions";
import { toggleBlockAccount } from "@/lib/messaging.functions";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notifications-store";
import type { MembershipTier } from "@/lib/membership";

export type PublicStory = {
  id: string | null;
  title: string | null;
  body: string | null;
  company_name: string | null;
  company_slug: string | null;
  company_id?: string | null;
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
  const { user } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
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
        className={`animate-rise group relative left-1/2 w-screen -translate-x-1/2 cursor-pointer border-b border-border/70 px-4 py-6 transition-colors hover:bg-secondary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:left-auto md:w-auto md:translate-x-0 md:px-5 ${discussionOpen ? "bg-primary/[0.03]" : ""}`}
        style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
      >
        <header className="flex items-center gap-3">
          <Link
            to="/u/$username"
            params={{ username: "candid" }}
            onClick={(event) => event.stopPropagation()}
            aria-label="View Candid profile"
          >
            <ProfileAvatar
              initials="C"
              photoUrl={story.author_photo_url}
              className="size-11 shrink-0"
            />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              to="/u/$username"
              params={{ username: "candid" }}
              onClick={(event) => event.stopPropagation()}
              className="text-sm font-semibold hover:text-primary"
            >
              Candid
            </Link>
            <p className="text-xs text-muted-foreground">
              @{story.author_username || "candid"} · {formatDate(story.created_at)}
            </p>
          </div>
          <FeedPostMenu
            story={story}
            userId={user?.uid ?? null}
            onReport={() => setReportOpen(true)}
            reported={reported}
          />
        </header>
        {story.body ? (
          <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed">
            <MentionText text={story.body} />
          </p>
        ) : null}
        {story.media?.length ? (
          <div
            className={`-mx-4 mt-4 grid w-[calc(100%+2rem)] gap-px overflow-hidden md:mx-0 md:w-full ${story.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
            onClick={(event) => event.stopPropagation()}
          >
            {story.media.map((media, mediaIndex) => (
              <div
                key={`${media.url}-${mediaIndex}`}
                className="relative min-w-0 overflow-hidden bg-black/5"
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
                    alt={`Candid attachment ${mediaIndex + 1}`}
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
        {story.id ? (
          <ReportDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            targetType="story"
            targetId={story.id}
            onReported={() => setReported(true)}
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
      className={`animate-rise group relative cursor-pointer border-b border-border/70 px-3 py-6 pr-14 transition-colors hover:bg-secondary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5 ${discussionOpen ? "bg-primary/[0.03]" : ""}`}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {story.company_slug ? (
          <Link
            to="/companies/$slug"
            params={{ slug: story.company_slug }}
            onClick={(event) => event.stopPropagation()}
            className="relative z-10 inline-flex items-center gap-0.5 font-semibold leading-none text-primary hover:text-primary/80"
          >
            {story.company_name}
            {story.company_verified ? <CompanyVerifiedBadge /> : null}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 font-semibold leading-none text-primary">
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
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {story.county}
            {story.area ? ` · ${story.area}` : ""}
          </span>
        )}
        {story.tenure ? <span>· {story.tenure}</span> : null}
        {story.role_level ? <span>· {story.role_level}</span> : null}
      </div>

      <div className="absolute right-3 top-4 z-20 sm:right-5">
        <FeedPostMenu
          story={story}
          userId={user?.uid ?? null}
          onReport={() => setReportOpen(true)}
          reported={reported}
        />
      </div>

      <h3 className="mt-2 text-lg font-semibold leading-snug">{story.title}</h3>

      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {story.author_username ? (
          <>
            <Link
              to="/u/$username"
              params={{ username: story.author_username }}
              onClick={(event) => event.stopPropagation()}
              className="relative z-10 font-medium hover:text-primary"
            >
              @{story.author_username}
            </Link>
            <MembershipBadge
              tier={story.author_membership_tier}
              official={story.author_username.toLowerCase() === "candid"}
            />
          </>
        ) : (
          <span>Candid member</span>
        )}
        <span aria-hidden="true">·</span>
        <span>{formatDate(story.created_at)}</span>
      </div>

      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
        <MentionText text={story.body ?? ""} linkMentions={false} />
      </p>

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
      {story.id ? (
        <ReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          targetType="story"
          targetId={story.id}
          onReported={() => setReported(true)}
        />
      ) : null}
    </article>
  );
}

export function FeedPostMenu({
  story,
  userId,
  onReport,
  reported,
}: {
  story: PublicStory;
  userId: string | null;
  onReport: () => void;
  reported: boolean;
}) {
  const follow = useServerFn(followAccount);
  const getRelationship = useServerFn(getAccountRelationship);
  const setPreference = useServerFn(updateFeedPreference);
  const block = useServerFn(toggleBlockAccount);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const relationshipKey = ["account-relationship", userId, story.author_id] as const;
  const relationship = useQuery({
    queryKey: relationshipKey,
    queryFn: () => getRelationship({ data: { user_id: story.author_id! } }),
    enabled: Boolean(
      userId && story.author_id && story.author_id !== userId && (open || mobileOpen),
    ),
    staleTime: 30_000,
  });
  const relationshipUnavailable = Boolean(userId && story.author_id && !relationship.data);
  const relationshipStatusMessage = relationship.isError
    ? "Account status unavailable"
    : "Checking account status…";
  const publisherHandle = `@${story.author_username ?? "publisher"}`;
  const followLabel = !userId
    ? `Follow ${publisherHandle}`
    : relationship.data?.isFollowing
      ? `Unfollow ${publisherHandle}`
      : relationship.data?.followStatus === "pending"
        ? `Cancel follow request to ${publisherHandle}`
        : relationship.data?.followsYou
          ? `Follow back ${publisherHandle}`
          : `Follow ${publisherHandle}`;
  const blockLabel = relationship.data?.isBlocked
    ? `Unblock ${publisherHandle}`
    : `Block ${publisherHandle}`;
  async function share() {
    if (!story.id || typeof window === "undefined") return;
    const url = new URL(
      `/stories/${encodeURIComponent(story.id)}`,
      window.location.origin,
    ).toString();
    try {
      if (navigator.share) await navigator.share({ title: story.title ?? "Candid post", url });
      else {
        await navigator.clipboard.writeText(url);
        notify.success("Post link copied.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      notify.error("Could not share this post.");
    }
  }
  async function followPublisher() {
    if (!userId) {
      notify.error("Sign in to follow this account.");
      return;
    }
    if (!story.author_id || story.author_id === userId) return;
    try {
      await follow({ data: { user_id: story.author_id } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: relationshipKey }),
        queryClient.invalidateQueries({ queryKey: ["public-profile"] }),
      ]);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not follow this account.");
    }
  }
  async function blockPublisher() {
    if (!userId) {
      notify.error("Sign in to block this account.");
      return;
    }
    if (!story.author_id || story.author_id === userId) return;
    try {
      await block({ data: { user_id: story.author_id } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: relationshipKey }),
        queryClient.invalidateQueries({ queryKey: ["public-profile"] }),
      ]);
      void queryClient.invalidateQueries({ queryKey: ["story-pages"] });
      void queryClient.invalidateQueries({ queryKey: ["stories"] });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not block this account.");
    }
  }
  async function notInterested(kind: "story" | "author" | "company", targetId: string) {
    if (!userId) {
      notify.error("Sign in to change your feed.");
      return;
    }
    try {
      await setPreference({ data: { kind, target_id: targetId, hidden: true } });
      void queryClient.invalidateQueries({ queryKey: ["story-pages", userId] });
      void queryClient.invalidateQueries({ queryKey: ["stories"] });
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not update your feed preferences.",
      );
    }
  }
  function runMobileAction(action: () => void) {
    setMobileOpen(false);
    action();
  }
  function mobileAction(
    Icon: typeof Share2,
    label: string,
    action: () => void,
    disabled = false,
    destructive = false,
  ) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          runMobileAction(action);
        }}
        className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 ${
          destructive ? "text-destructive" : "text-foreground"
        }`}
      >
        <Icon className="size-4 shrink-0" />
        {label}
      </button>
    );
  }
  return (
    <>
      <div className="hidden md:block">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-full bg-background/90"
              aria-label="Post options"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                void share();
              }}
            >
              <Share2 /> Share post
            </DropdownMenuItem>
            {story.author_id && story.author_id !== userId ? (
              <DropdownMenuItem
                disabled={relationshipUnavailable}
                onSelect={(event) => {
                  event.preventDefault();
                  void followPublisher();
                }}
              >
                <UserRoundPlus />
                {relationshipUnavailable ? relationshipStatusMessage : followLabel}
              </DropdownMenuItem>
            ) : null}
            {story.author_id && story.author_id !== userId ? (
              <DropdownMenuItem
                disabled={relationshipUnavailable}
                onSelect={(event) => {
                  event.preventDefault();
                  void blockPublisher();
                }}
              >
                <Ban /> {relationshipUnavailable ? relationshipStatusMessage : blockLabel}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <EyeOff /> Not interested
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  disabled={!userId}
                  onSelect={(event) => {
                    event.preventDefault();
                    if (story.id) void notInterested("story", story.id);
                  }}
                >
                  <EyeOff /> Hide this post
                </DropdownMenuItem>
                {story.author_id && story.author_id !== userId ? (
                  <DropdownMenuItem
                    disabled={!userId}
                    onSelect={(event) => {
                      event.preventDefault();
                      void notInterested("author", story.author_id!);
                    }}
                  >
                    <UserRoundX /> Fewer posts from this account
                  </DropdownMenuItem>
                ) : null}
                {story.company_id ? (
                  <DropdownMenuItem
                    disabled={!userId}
                    onSelect={(event) => {
                      event.preventDefault();
                      void notInterested("company", story.company_id!);
                    }}
                  >
                    <Building2 /> Fewer posts about {story.company_name ?? "this employer"}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              disabled={!userId || reported}
              onSelect={(event) => {
                event.preventDefault();
                if (userId) onReport();
                else notify.error("Sign in to report this post.");
              }}
              className="text-destructive"
            >
              <Flag /> {reported ? "Already reported" : "Report post"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 rounded-full bg-background/90 md:hidden"
        aria-label="Post options"
        onClick={(event) => {
          event.stopPropagation();
          setMobileOpen(true);
        }}
      >
        <MoreHorizontal className="size-5" />
      </Button>
      <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
        <DrawerContent
          className="max-h-[82dvh] rounded-t-3xl md:hidden"
          overlayOnClick={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <DrawerHeader className="shrink-0 text-left">
            <DrawerTitle>Post options</DrawerTitle>
            <DrawerDescription>
              {story.title
                ? `Choose an action for “${story.title}”.`
                : "Choose an action for this post."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 overflow-y-auto px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {mobileAction(Share2, "Share post", () => void share())}
            {story.author_id && story.author_id !== userId
              ? mobileAction(
                  UserRoundPlus,
                  relationshipUnavailable ? relationshipStatusMessage : followLabel,
                  () => void followPublisher(),
                  relationshipUnavailable,
                )
              : null}
            {story.author_id && story.author_id !== userId
              ? mobileAction(
                  Ban,
                  relationshipUnavailable ? relationshipStatusMessage : blockLabel,
                  () => void blockPublisher(),
                  relationshipUnavailable,
                )
              : null}
            <div className="my-2 border-t border-border" />
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Not interested
            </p>
            {mobileAction(
              EyeOff,
              "Hide this post",
              () => {
                if (story.id) void notInterested("story", story.id);
              },
              !userId,
            )}
            {story.author_id && story.author_id !== userId
              ? mobileAction(
                  UserRoundX,
                  "Fewer posts from this account",
                  () => void notInterested("author", story.author_id!),
                  !userId,
                )
              : null}
            {story.company_id
              ? mobileAction(
                  Building2,
                  `Fewer posts about ${story.company_name ?? "this employer"}`,
                  () => void notInterested("company", story.company_id!),
                  !userId,
                )
              : null}
            <div className="my-2 border-t border-border" />
            {mobileAction(
              Flag,
              reported ? "Already reported" : "Report post",
              () => {
                if (userId) onReport();
                else notify.error("Sign in to report this post.");
              },
              !userId || reported,
              true,
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
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
