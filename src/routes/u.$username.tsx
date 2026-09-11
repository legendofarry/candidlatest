import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import {
  BadgeCheck,
  Ban,
  Link2,
  MapPin,
  MessageSquare,
  UserRound,
  UserPlus,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import {
  getPublicProfile,
  startConversation,
  toggleBlockAccount,
} from "@/lib/messaging.functions";
import { followAccount } from "@/lib/social.functions";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications-store";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

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

  const fetchProfile = useServerFn(getPublicProfile);
  const follow = useServerFn(followAccount);
  const block = useServerFn(toggleBlockAccount);
  const openChat = useServerFn(startConversation);

  const { data, isLoading } = useQuery({
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

  if (!data) {
    return (
      <EmptyState
        title="Profile not found"
        body={`We could not find anyone using @${username}.`}
        action={<Button variant="outline" onClick={() => navigate({ to: "/" })}>Back to feed</Button>}
      />
    );
  }

  const profile = data;

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["public-profile", username] });
      notify.success(message);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="glass-card relative overflow-hidden rounded-3xl border border-border p-6"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-secondary text-2xl font-semibold uppercase">
            {profile.username.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 font-display text-2xl font-semibold tracking-tight">
              @{profile.username}
              {profile.verified ? <BadgeCheck className="size-5 text-primary" /> : null}
            </h1>
            {profile.role_label ? (
              <p className="text-sm text-muted-foreground">{profile.role_label}</p>
            ) : null}
            {profile.county ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> {profile.county}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex gap-6">
          <Stat label="Followers" value={profile.followers} />
          <Stat label="Following" value={profile.following} />
        </div>

        {profile.isSelf ? null : (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              disabled={busy}
              variant={profile.isFollowing ? "outline" : "default"}
              className={cn(!profile.isFollowing && "glow-primary")}
              onClick={() =>
                void run(
                  () => follow({ data: { user_id: profile.id } }),
                  profile.isFollowing ? "Unfollowed" : "Following",
                )
              }
            >
              {profile.isFollowing ? (
                <>
                  <UserCheck className="size-4" /> Following
                </>
              ) : (
                <>
                  <UserPlus className="size-4" /> Follow
                </>
              )}
            </Button>
            <Button
              variant="outline"
              disabled={busy || profile.isBlocked}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  try {
                    const result = await openChat({ data: { user_id: profile.id } });
                    navigate({
                      to: "/messages/$id",
                      params: { id: result.conversation_id },
                    });
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
            {profile.official ? null : (
              <Button
                variant="ghost"
                disabled={busy}
                className="text-danger"
                onClick={() =>
                  void run(
                    () => block({ data: { user_id: profile.id } }),
                    profile.isBlocked ? "Unblocked" : "Account blocked",
                  )
                }
              >
                <Ban className="size-4" /> {profile.isBlocked ? "Unblock" : "Block"}
              </Button>
            )}
          </div>
        )}
      </motion.section>

      {profile.socials ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Links
          </h2>
          <ul className="mt-3 space-y-2">
            {(Object.entries(profile.socials) as [string, string | null][])
              .filter(([, value]) => Boolean(value))
              .map(([key, value]) => (
                <li key={key}>
                  <a
                    href={value as string}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Link2 className="size-4" /> {key}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
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
