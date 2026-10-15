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
  Plus,
  UserRound,
  UserPlus,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import { getPublicProfile, startConversation, toggleBlockAccount } from "@/lib/messaging.functions";
import { followAccount } from "@/lib/social.functions";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";
import { cn, formatCount } from "@/lib/utils";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { MembershipBadge } from "@/components/site/membership-badge";

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"All" | "Stories" | "About">("All");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const fetchProfile = useServerFn(getPublicProfile);
  const follow = useServerFn(followAccount);
  const block = useServerFn(toggleBlockAccount);
  const openChat = useServerFn(startConversation);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["public-profile", username, user?.uid ?? null],
    queryFn: () => fetchProfile({ data: { username } }),
    enabled: Boolean(user),
  });

  if (!user) {
    return (
      <EmptyState
        title="Sign in to view profiles"
        body="Candid profiles are only visible to members."
        action={<Button onClick={() => navigate({ to: "/auth" })}>Sign in</Button>}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="h-40 animate-pulse rounded-3xl bg-secondary" />
        <div className="h-24 animate-pulse rounded-2xl bg-secondary" />
      </div>
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
  const publicStories = profile.stories ?? [];

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
    <div className="-mt-4 w-full overflow-hidden bg-background text-foreground md:mt-0">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-card"
      >
        <div className="relative h-[170px] overflow-hidden bg-secondary sm:h-[280px] md:h-[360px]">
          {typeof profile.cover_url === "string" && profile.cover_url ? (
            <img
              src={profile.cover_url.replace(
                "/upload/",
                "/upload/c_fill,ar_16:6,w_1600,q_auto,f_auto/",
              )}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <div className="relative size-full overflow-hidden bg-[radial-gradient(ellipse_at_18%_5%,rgba(204,255,0,0.3),transparent_40%),radial-gradient(ellipse_at_88%_100%,rgba(0,198,160,0.2),transparent_42%),linear-gradient(125deg,#17201d,#0b1113_60%,#131a1c)]">
              <div
                aria-hidden="true"
                className="absolute -right-12 -top-24 size-72 rounded-full border border-white/10 shadow-[0_0_0_32px_rgba(255,255,255,0.025),0_0_0_72px_rgba(255,255,255,0.02)]"
              />
              <div className="absolute bottom-5 left-5 sm:bottom-7 sm:left-8">
                <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-primary">
                  Candid community
                </p>
                <p className="mt-1 font-display text-lg font-semibold text-white/90 sm:text-2xl">
                  Real stories. Real workplaces.
                </p>
              </div>
            </div>
          )}
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

        <nav
          aria-label="Profile sections"
          className="flex gap-1 overflow-x-auto border-t border-border px-1 sm:px-6"
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
      </motion.section>

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

          <section className="border-y border-border/70 bg-card/80 px-4 py-3 sm:rounded-xl sm:border sm:px-5 sm:py-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold sm:text-xl">
                  Community{" "}
                  <span className="ml-1 text-sm font-medium text-muted-foreground">
                    {formatCount(profile.followers)}
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  People following @{profile.username}
                </p>
              </div>
            </div>
            {followerPreview.length ? (
              <div className="-mx-1 flex gap-3 overflow-x-auto pb-1">
                {followerPreview.map((person) => (
                  <Link
                    key={person.id}
                    to="/u/$username"
                    params={{ username: person.username }}
                    className="w-[calc(50%-6px)] min-w-[138px] shrink-0 overflow-hidden rounded-xl border border-border bg-background sm:w-40"
                  >
                    <ProfileAvatar
                      photoUrl={person.photo_url}
                      initials={person.username.slice(0, 2)}
                      className="aspect-square w-full rounded-none bg-secondary text-3xl"
                    />
                    <span className="block truncate px-3 py-2 text-sm font-semibold">
                      @{person.username}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">
                No community members to show yet.
              </p>
            )}
          </section>
        </div>
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
            {publicStories.length ? (
              <div className="divide-y divide-border">
                {publicStories.map((story) => (
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
                          {story.company_name || "Workplace story"}
                          {story.county
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
                      <h3 className="mt-3 text-base font-semibold">{story.title}</h3>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                        {story.body}
                      </p>
                    </Link>
                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Heart className="size-4" /> {formatCount(story.likes)}
                      </span>
                      <Link
                        to="/stories/$id"
                        params={{ id: story.id }}
                        className="inline-flex items-center gap-1.5"
                      >
                        <MessageSquare className="size-4" /> {formatCount(story.comment_count)}{" "}
                        comments
                      </Link>
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
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No published stories yet.
              </p>
            )}
          </section>
        </div>
      ) : null}
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
