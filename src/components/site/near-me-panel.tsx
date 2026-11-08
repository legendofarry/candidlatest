import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, EyeOff, MapPin, ShieldCheck, Users } from "lucide-react";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useNearMe } from "@/hooks/use-near-me";
import { getMyNearMe, getNearbyPeople, setMyNearMePeople } from "@/lib/near-me.functions";
import { roundCoarse } from "@/lib/near-me";
import { notify } from "@/lib/notifications-store";

export type NearEmployer = {
  company_id: string;
  slug: string;
  name: string;
  verified: boolean;
  industry: string | null;
  area: string | null;
  story_count: number;
  distance_km: number;
  distance_label: string;
};

const scroller =
  "flex gap-2 overflow-x-auto px-3 pb-4 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden";

function Employers({
  employers,
  loading,
  radius,
  onChange,
}: {
  employers: NearEmployer[];
  loading: boolean;
  radius: number;
  onChange: () => void;
}) {
  return (
    <div className="border-t border-border/60 pt-3">
      <h2 className="flex items-center gap-2 px-3 pb-2 text-sm font-semibold sm:px-5">
        <Building2 className="size-4 text-primary" /> Employers near you
      </h2>
      {loading ? (
        <div className={scroller}>
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-14 w-44 shrink-0 rounded-2xl" />
          ))}
        </div>
      ) : employers.length ? (
        <div className={scroller}>
          {employers.map((employer) => (
            <Link
              key={employer.company_id}
              to="/companies/$slug"
              params={{ slug: employer.slug }}
              className="flex w-48 shrink-0 flex-col justify-center rounded-2xl border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center gap-1 truncate text-sm font-semibold">
                <span className="truncate">{employer.name}</span>
                {employer.verified ? <CompanyVerifiedBadge /> : null}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {employer.distance_label} · {employer.story_count}{" "}
                {employer.story_count === 1 ? "story" : "stories"}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="px-3 pb-4 text-sm text-muted-foreground sm:px-5">
          No employers with stories within {radius} km yet.{" "}
          <button type="button" onClick={onChange} className="font-medium text-primary underline-offset-2 hover:underline">
            Search wider
          </button>
        </p>
      )}
    </div>
  );
}

function NearbyPeople() {
  const { user } = useAuth();
  const near = useNearMe();
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getMyNearMe);
  const fetchPeople = useServerFn(getNearbyPeople);
  const savePresence = useServerFn(setMyNearMePeople);
  const signedIn = Boolean(user?.emailVerified);
  const location = near.location;

  const settings = useQuery({
    queryKey: ["near-me-settings", user?.uid ?? null],
    queryFn: () => fetchSettings(),
    enabled: signedIn,
    staleTime: 60_000,
  });
  const visible = Boolean(settings.data?.peopleVisible);

  const people = useQuery({
    queryKey: [
      "near-me-people",
      user?.uid ?? null,
      location ? roundCoarse(location.lat) : null,
      location ? roundCoarse(location.lng) : null,
      near.radius,
    ],
    queryFn: () =>
      fetchPeople({ data: { lat: location!.lat, lng: location!.lng, radiusKm: near.radius } }),
    enabled: signedIn && visible && Boolean(location),
    staleTime: 60_000,
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      savePresence({
        data: enabled && location ? { enabled, lat: location.lat, lng: location.lng } : { enabled: false },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["near-me-settings", user?.uid ?? null] });
      await queryClient.invalidateQueries({ queryKey: ["near-me-people", user?.uid ?? null] });
    },
    onError: (error) =>
      notify.error(error instanceof Error ? error.message : "Could not update this setting."),
  });

  // Keep the stored coarse area in step with where the member is now (only while opted in).
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || !location) return;
    const cell = `${roundCoarse(location.lat)},${roundCoarse(location.lng)}`;
    if (synced.current === null) {
      synced.current = cell;
      return;
    }
    if (synced.current === cell) return;
    synced.current = cell;
    void savePresence({ data: { enabled: true, lat: location.lat, lng: location.lng } }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["near-me-settings", user?.uid ?? null] }),
    );
  }, [visible, location, savePresence, queryClient, user?.uid]);

  return (
    <div className="border-t border-border/60 pt-3">
      <div className="flex items-center gap-2 px-3 sm:px-5">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-primary" /> People nearby
        </h2>
        {signedIn && visible ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Visible
            <Switch
              checked
              disabled={toggle.isPending}
              onCheckedChange={() => toggle.mutate(false)}
              aria-label="Stop showing me to people nearby"
            />
          </label>
        ) : null}
      </div>

      {!signedIn ? (
        <p className="px-3 pb-4 pt-2 text-sm text-muted-foreground sm:px-5">
          <Link to={user ? "/verify-email" : "/auth"} className="font-medium text-primary hover:underline">
            {user ? "Verify your email" : "Log in"}
          </Link>{" "}
          to see people you follow, or who follow you, when they are nearby.
        </p>
      ) : settings.isPending ? (
        <div className={`${scroller} pt-2`}>
          <Skeleton className="h-16 w-40 shrink-0 rounded-2xl" />
        </div>
      ) : !visible ? (
        <div className="px-3 pb-4 pt-2 sm:px-5">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              See people you follow, or who follow you, who are nearby. It works both ways: you only
              see them if you turn this on, and they only see you if they do. Others only get your
              area, never an exact spot. Anonymous posts are never part of this.
            </span>
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3 rounded-full"
            disabled={toggle.isPending || !location}
            onClick={() => toggle.mutate(true)}
          >
            <Users className="size-4" /> Show me to people nearby
          </Button>
        </div>
      ) : people.isPending ? (
        <div className={`${scroller} pt-2`}>
          {[0, 1].map((item) => (
            <Skeleton key={item} className="h-16 w-40 shrink-0 rounded-2xl" />
          ))}
        </div>
      ) : people.data?.people.length ? (
        <>
          <p className="flex items-center gap-1.5 px-3 pt-1 text-xs text-muted-foreground sm:px-5">
            <MapPin className="size-3" /> You appear as {settings.data?.area ?? "your area"}
          </p>
          <div className={`${scroller} pt-2`}>
            {people.data.people.map((person) => (
              <Link
                key={person.id}
                to="/u/$username"
                params={{ username: person.username }}
                className="flex w-52 shrink-0 items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted/50"
              >
                <ProfileAvatar
                  initials={person.username.slice(0, 1).toUpperCase()}
                  photoUrl={person.photo_url}
                  className="size-10 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">@{person.username}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {person.relation === "mutual"
                      ? "Follows each other"
                      : person.relation === "following"
                        ? "You follow"
                        : "Follows you"}{" "}
                    · {person.distance_label}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <p className="flex items-start gap-2 px-3 pb-4 pt-2 text-sm text-muted-foreground sm:px-5">
          <EyeOff className="mt-0.5 size-4 shrink-0" />
          <span>
            None of the people you follow, or who follow you, are nearby right now. They appear here
            once they turn on Near me too.
          </span>
        </p>
      )}
    </div>
  );
}

/** The set-aside Near me section: where you are, employers close by, and opt-in people nearby. */
export function NearMePanel({
  employers,
  loading,
  onChange,
}: {
  employers: NearEmployer[];
  loading: boolean;
  onChange: () => void;
}) {
  const near = useNearMe();
  if (!near.location) return null;
  return (
    <section aria-label="Near me" className="mb-3 border-y border-border/70 bg-primary/[0.03]">
      <div className="flex items-center gap-3 px-3 py-3 sm:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MapPin className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Near {near.location.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            Within {near.radius} km · your exact location stays on this device
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={onChange}>
          Change
        </Button>
      </div>
      <Employers employers={employers} loading={loading} radius={near.radius} onChange={onChange} />
      <NearbyPeople />
    </section>
  );
}
