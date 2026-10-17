import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import {
  BadgeCheck,
  BriefcaseBusiness,
  BookOpen,
  Camera,
  CalendarDays,
  Ellipsis,
  Heart,
  Image,
  Link2,
  MapPin,
  MessageSquare,
  Pin,
  Plus,
  UserRound,
  UserPlus,
  UserCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  getPublicProfile,
  getPublicProfileStories,
  startConversation,
  toggleBlockAccount,
} from "@/lib/messaging.functions";
import { followAccount } from "@/lib/social.functions";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatCount } from "@/lib/utils";
import {
  DEFAULT_PROFILE_COVER_URL,
  ProfileAvatar,
  coverDeliveryUrl,
} from "@/components/site/profile-photo";
import { MembershipBadge } from "@/components/site/membership-badge";
import { ProfileCommunity } from "@/components/site/profile-community";
import { ProfileStoryComments } from "@/components/site/profile-story-comments";

type ProfileStory = {
  id: string;
  title: string;
  body: string;
  company_name: string | null;
  county: string | null;
  area: string | null;
  created_at: string;
  comment_count: number;
  likes: number;
  post_type: "workplace_story" | "announcement";
  media: { url: string; resource_type: "image" | "video" }[];
  is_pinned?: boolean;
};

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => {
    const title = `@${params.username} on Candid`;
    const description = `See @${params.username}'s Candid profile — badge status, followers and a private message option.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const { username } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"All" | "Stories" | "About">("All");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [commentStory, setCommentStory] = useState<ProfileStory | null>(null);

  const fetchProfile = useServerFn(getPublicProfile);
  const fetchProfileStories = useServerFn(getPublicProfileStories);
  const follow = useServerFn(followAccount);
  const block = useServerFn(toggleBlockAccount);
  const openChat = useServerFn(startConversation);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["public-profile", username, user?.uid ?? null],
    queryFn: () => fetchProfile({ data: { username } }),
    enabled: Boolean(user),
    staleTime: 30_000,
  });
  const [profileStories, setProfileStories] = useState<ProfileStory[]>([]);
  const [profileStoriesCursor, setProfileStoriesCursor] = useState<{
    createdAt: string;
    id: string;
  } | null>(null);
  const [hasMoreProfileStories, setHasMoreProfileStories] = useState(false);
  const [loadingProfileStories, setLoadingProfileStories] = useState(false);

  useEffect(() => {
    if (!data) return;
    setProfileStories(data.stories as ProfileStory[]);
    setProfileStoriesCursor(data.storiesCursor);
    setHasMoreProfileStories(data.storiesHasMore);
  }, [data]);

  if (authLoading || (isLoading && Boolean(user))) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="h-40 animate-pulse rounded-3xl bg-secondary" />
        <div className="h-24 animate-pulse rounded-2xl bg-secondary" />
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        title="Sign in to view profiles"
        body="Candid profiles are only visible to members."
        action={<Button onClick={() => navigate({ to: "/auth" })}>Sign in</Button>}
      />
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="We couldn’t load this profile"
        body="Please try again in a moment. Your profile data is still safe."
        action={
          <Button
            variant="outline"
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: ["public-profile", username] })
            }
          >
            Try again
          </Button>
        }
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Profile not found"
        body={`We could not find anyone using @${username}.`}
        action={
          <Button variant="outline" onClick={() => navigate({ to: "/" })}>
            Back to feed
          </Button>
        }
      />
    );
  }

  const profile = data;
  const followerPreview = profile.follower_preview ?? [];
  const pinnedStories = (profile.pinnedStories ?? []) as ProfileStory[];
  const pinnedStoryIds = new Set<string>(profile.pinnedStoryIds ?? []);
  const visibleProfileStories = profileStories.filter((story) => !pinnedStoryIds.has(story.id));

  async function loadMoreProfileStories() {
    if (!profileStoriesCursor || loadingProfileStories) return;
    setLoadingProfileStories(true);
    try {
      const page = await fetchProfileStories({
        data: { username: profile.username, cursor: profileStoriesCursor },
      });
      setProfileStories((current) => {
        const known = new Set(current.map((story) => story.id));
        return [
          ...current,
          ...(page.stories as ProfileStory[]).filter((story) => !known.has(story.id)),
        ];
      });
      setProfileStoriesCursor(page.nextCursor);
      setHasMoreProfileStories(page.hasMore);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not load more stories.");
    } finally {
      setLoadingProfileStories(false);
    }
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["public-profile", username] });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const socialLinks = profile.socials
    ? (Object.entries(profile.socials) as [string, string | null][])
        .map(([key, value]) => [key, profileLink(key, value)] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    : [];
  const tabs = ["All", "Stories", "About"] as const;

  return (
    <div className="-mt-4 w-full overflow-x-clip bg-background text-foreground md:mt-0">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-card"
      >
        <div className="relative h-[170px] overflow-hidden bg-secondary sm:h-[280px] md:h-[360px]">
          <img
            src={coverDeliveryUrl(profile.cover_url || DEFAULT_PROFILE_COVER_URL)}
            alt=""
            className="size-full scale-[1.03] object-cover blur-[2px]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/15" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-end p-3 text-white sm:p-5">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="More profile options"
                  aria-expanded={profileMenuOpen}
                  className="rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                >
                  <Ellipsis className="size-5" />
                </Button>
                {profileMenuOpen ? (
                  <div className="absolute right-0 top-12 z-20 min-w-44 rounded-xl border border-border bg-card p-1.5 text-foreground shadow-xl">
                    {profile.isSelf ? (
                      <Link
                        to="/profile"
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-secondary"
                      >
                        Edit profile
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setProfileMenuOpen(false);
                          void run(() => block({ data: { user_id: profile.id } }));
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-50"
                      >
                        {profile.isBlocked ? "Unblock account" : "Block account"}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {profile.isSelf ? (
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-3 right-3 rounded-lg bg-card text-foreground shadow-sm hover:bg-card/90"
              onClick={() => navigate({ to: "/profile" })}
            >
              <Camera className="size-4" /> Edit cover photo
            </Button>
          ) : null}
        </div>

        <div className="relative rounded-t-[24px] bg-card px-4 pb-3 sm:px-7 sm:pb-4 md:px-10">
          <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-end sm:justify-between sm:pb-4">
            <div className="flex min-w-0 items-end gap-3 sm:gap-5">
              <ProfileAvatar
                photoUrl={profile.photo_url}
                initials={profile.username.slice(0, 2)}
                className="-mt-9 size-20 shrink-0 border-4 border-card bg-card text-2xl uppercase shadow sm:-mt-12 sm:size-36 sm:text-3xl"
              />
              <div className="min-w-0 pb-1">
                <h1 className="flex flex-wrap items-center gap-1.5 text-xl font-bold tracking-tight sm:text-3xl">
                  @{profile.username}
                  {profile.verified ? <BadgeCheck className="size-5 text-sky-500" /> : null}
                  <MembershipBadge
                    tier={profile.membership_tier as "basic" | "premium" | "gold" | null}
                    official={profile.official}
                  />
                </h1>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {formatCount(profile.followers)} followers · {formatCount(profile.following)}{" "}
                  following · {formatCount(profile.contributions.stories)} stories
                </p>
                {profile.official ? (
                  <p className="text-xs font-medium text-primary">Official Candid account</p>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2 sm:pb-1">
              {profile.isSelf ? (
                <Button
                  className="flex-1 rounded-lg sm:flex-none"
                  onClick={() => navigate({ to: "/post" })}
                >
                  <Plus className="size-4" /> Create story
                </Button>
              ) : (
                <>
                  <Button
                    disabled={busy}
                    className={cn(
                      "h-10 flex-1 rounded-lg sm:flex-none",
                      profile.isFollowing && "bg-secondary text-foreground hover:bg-secondary/80",
                    )}
                    onClick={() => void run(() => follow({ data: { user_id: profile.id } }))}
                  >
                    {profile.isFollowing ? (
                      <UserCheck className="size-4" />
                    ) : (
                      <UserPlus className="size-4" />
                    )}
                    {profile.isFollowing ? "Following" : "Follow"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-10 flex-1 rounded-lg sm:flex-none"
                    disabled={busy || profile.isBlocked || !profile.messaging.allowed}
                    onClick={() =>
                      void (async () => {
                        setBusy(true);
                        try {
                          const result = await openChat({ data: { user_id: profile.id } });
                          navigate({ to: "/messages/$id", params: { id: result.conversation_id } });
                        } catch (error) {
                          notify.error(
                            error instanceof Error ? error.message : "Cannot message this account",
                          );
                        } finally {
                          setBusy(false);
                        }
                      })()
                    }
                  >
                    <MessageSquare className="size-4" /> Message
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="border-b border-border py-2 text-left sm:py-3">
            {profile.role_label ? (
              <p className="font-medium">{profile.role_label}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No intro added yet.</p>
            )}
            {profile.followsYou && !profile.isSelf ? (
              <p className="mt-1 text-xs text-muted-foreground">Follows you</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-3 text-xs text-muted-foreground sm:text-sm">
            {profile.contributions.joined_at ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" /> Joined{" "}
                {new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(
                  new Date(profile.contributions.joined_at),
                )}
              </span>
            ) : null}
          </div>
        </div>

      </motion.section>

      <nav
        aria-label="Profile sections"
        className="sticky top-16 z-40 flex gap-1 overflow-x-auto border-t border-border bg-background/95 px-1 backdrop-blur-md sm:px-6"
      >
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab}
            aria-current={activeTab === tab ? "page" : undefined}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "relative shrink-0 px-3 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary/60 sm:px-4 sm:py-4",
              activeTab === tab &&
                "text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-full after:bg-primary",
            )}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab !== "Stories" ? (
        <div className="space-y-2 bg-background py-2 sm:space-y-3 sm:px-5 sm:py-3">
          <section className="border-y border-border/70 bg-card/80 px-4 py-3 sm:rounded-xl sm:border sm:px-5 sm:py-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold sm:text-xl">About @{profile.username}</h2>
            </div>
            <div className="space-y-3">
              {profile.role_label ? (
                <p className="flex items-center gap-3 text-sm">
                  <BriefcaseBusiness className="size-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block font-medium">{profile.role_label}</span>
                    <span className="text-xs text-muted-foreground">Workplace or role</span>
                  </span>
                </p>
              ) : null}
              {profile.county ? (
                <p className="flex items-center gap-3 text-sm">
                  <MapPin className="size-4 shrink-0 text-muted-foreground" />
                  <span>{profile.county}, Kenya</span>
                </p>
              ) : null}
              {socialLinks.map(([key, href]) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-3 text-sm text-primary"
                >
                  <Link2 className="size-4" />
                  <span className="capitalize">{key}</span>
                </a>
              ))}
              {!profile.role_label && !profile.county && socialLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No public details have been shared.</p>
              ) : null}
            </div>
          </section>

          <ProfileCommunity
            username={profile.username}
            followerCount={profile.followers}
            preview={followerPreview}
          />
        </div>
      ) : null}

      {activeTab !== "About" ? (
        pinnedStories.length ? (
          <section className="mx-4 mb-3 overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.035] sm:mx-5">
            <div className="flex items-center justify-between gap-3 border-b border-primary/10 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <Pin className="size-4 text-primary" />
                <h2 className="font-semibold">Pinned stories</h2>
              </div>
              {profile.isSelf ? (
                <Link to="/my-contributions" className="text-xs font-medium text-primary">
                  Manage pins
                </Link>
              ) : null}
            </div>
            <div className="divide-y divide-primary/10">
              {pinnedStories.map((story) => (
                <article key={story.id} className="px-4 py-3 sm:px-5">
                  <p className="text-xs text-muted-foreground">
                    {story.post_type === "announcement"
                      ? "Candid update"
                      : story.company_name || "Workplace story"}
                    {story.county ? ` · ${story.county}${story.area ? `, ${story.area}` : ""}` : ""}
                  </p>
                  <Link
                    to="/stories/$id"
                    params={{ id: story.id }}
                    className="mt-1 block font-semibold hover:text-primary"
                  >
                    {story.post_type === "announcement" ? "Candid update" : story.title}
                  </Link>
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                    {story.body}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null
      ) : null}

      {activeTab !== "About" ? (
        <div className="bg-background pb-3 sm:px-5">
          <section className="overflow-hidden border-y border-border/70 bg-card sm:rounded-xl sm:border">
            <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4">
              <div>
                <h2 className="text-lg font-bold sm:text-xl">Stories</h2>
                <p className="text-xs text-muted-foreground">
                  {formatCount(profile.contributions.stories)} published
                </p>
              </div>
            </div>
            {profile.isSelf ? (
              <>
                <Link
                  to="/post"
                  className="flex items-center gap-3 border-y border-border px-4 py-3 sm:px-5"
                >
                  <ProfileAvatar
                    photoUrl={profile.photo_url}
                    initials={profile.username.slice(0, 2)}
                    className="size-10 border border-border"
                  />
                  <span className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
                    Share a workplace story…
                  </span>
                  <Image className="size-5 text-primary" />
                </Link>
                <Link
                  to="/profile"
                  className="mx-4 my-3 flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold sm:mx-5"
                >
                  <BookOpen className="size-4" /> Manage stories
                </Link>
              </>
            ) : null}
            {visibleProfileStories.length ? (
              <div className="divide-y divide-border">
                {visibleProfileStories.map((story) => (
                  <article key={story.id} className="px-4 py-4 sm:px-5">
                    <div className="flex items-start gap-3">
                      <ProfileAvatar
                        photoUrl={profile.photo_url}
                        initials={profile.username.slice(0, 2)}
                        className="size-10 border border-border"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">@{profile.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {story.post_type === "announcement"
                            ? "Candid update"
                            : story.company_name || "Workplace story"}
                          {story.post_type !== "announcement" && story.county
                            ? ` · ${story.county}${story.area ? `, ${story.area}` : ""}`
                            : ""}{" "}
                          · {new Date(story.created_at).toLocaleDateString("en-KE")}
                        </p>
                      </div>
                    </div>
                    <Link
                      to="/stories/$id"
                      params={{ id: story.id }}
                      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <h3 className="mt-3 text-base font-semibold">
                        {story.post_type === "announcement" ? "Candid update" : story.title}
                      </h3>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                        {story.body}
                      </p>
                    </Link>
                    {story.media.length ? (
                      <div
                        className={`mt-3 grid gap-1.5 overflow-hidden rounded-xl bg-secondary ${story.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
                      >
                        {story.media.map((media, index) =>
                          media.resource_type === "video" ? (
                            <video
                              key={`${media.url}-${index}`}
                              src={media.url}
                              controls
                              playsInline
                              className="max-h-[60vh] min-h-32 w-full object-contain"
                            />
                          ) : (
                            <img
                              key={`${media.url}-${index}`}
                              src={media.url}
                              alt={`Candid update attachment ${index + 1}`}
                              loading="lazy"
                              className="max-h-[60vh] min-h-32 w-full object-contain"
                            />
                          ),
                        )}
                      </div>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Heart className="size-4" /> {formatCount(story.likes)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCommentStory(story)}
                        aria-label={`View comments, ${formatCount(story.comment_count)} total`}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <MessageSquare className="size-4" />
                        {formatCount(story.comment_count)} comments
                      </button>
                      <Link
                        to="/stories/$id"
                        params={{ id: story.id }}
                        className="font-medium text-primary"
                      >
                        Read story
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : pinnedStories.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No published stories yet.
              </p>
            ) : null}
            {hasMoreProfileStories ? (
              <div className="flex justify-center border-t border-border p-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingProfileStories}
                  onClick={() => void loadMoreProfileStories()}
                >
                  {loadingProfileStories ? "Loading stories…" : "Load 30 more stories"}
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <ProfileStoryComments
        story={commentStory}
        open={Boolean(commentStory)}
        onOpenChange={(open) => {
          if (!open) setCommentStory(null);
        }}
      />
    </div>
  );
}

function profileLink(key: string, raw: string | null) {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https:\/\//i.test(value)) {
    try {
      return new URL(value).protocol === "https:" ? value : null;
    } catch {
      return null;
    }
  }
  const handle = value.replace(/^@/, "").replace(/^\/+/, "");
  if (!handle || /[\s/]/.test(handle)) return null;
  if (key === "x") return `https://x.com/${encodeURIComponent(handle)}`;
  if (key === "instagram") return `https://instagram.com/${encodeURIComponent(handle)}`;
  if (key === "tiktok") return `https://tiktok.com/@${encodeURIComponent(handle)}`;
  if (key === "linkedin") return `https://linkedin.com/${encodeURIComponent(handle)}`;
  return null;
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <UserRound className="mx-auto size-10 text-primary" />
      <h1 className="mt-4 font-display text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <div className="mt-6">{action}</div>
    </div>
  );
}
