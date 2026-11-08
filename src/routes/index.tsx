import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useInfiniteQuery, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  Activity,
  Bookmark,
  Flame,
  Navigation,
  PenLine,
  Radar,
  Sparkles,
  TrendingUp,
  UserCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getFilterOptions, listStories, listStoryPage } from "@/lib/public.functions";
import { StoryCard } from "@/components/site/story-card";
import type { PublicStory } from "@/components/site/story-card";
import { FeedDiscussionPanel } from "@/components/site/feed-discussion-panel";
import { PulseLoader } from "@/components/site/route-progress";
import { FilterBar } from "@/components/site/filter-bar";
import { CandidPulse } from "@/components/site/candid-pulse";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { useAuth } from "@/hooks/useAuth";
import { useAutoCollapsingCount } from "@/hooks/use-auto-collapsing-count";
import { useWatchedCompanies } from "@/hooks/use-watched-companies";
import { useNearMe } from "@/hooks/use-near-me";
import { NearMePanel, type NearEmployer } from "@/components/site/near-me-panel";
import { NearMeSheet } from "@/components/site/near-me-sheet";
import { getLensStories, getNearMeFeed } from "@/lib/near-me.functions";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const feedQuery = queryOptions({
  queryKey: ["stories", "new"],
  queryFn: () => listStoryPage({ data: { limit: 20, cursor: null } }),
});

const filtersQuery = queryOptions({
  queryKey: ["filters"],
  queryFn: () => getFilterOptions(),
});

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(feedQuery),
      context.queryClient.ensureQueryData(filtersQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Candid — workplace stories from Kenya" },
      {
        name: "description",
        content:
          "Read workplace stories from Kenyan employees and research employers before you accept an offer. Pay, contracts, respect and workload — told by the people who left.",
      },
      { property: "og:title", content: "Candid — Kenyan workplace stories" },
      {
        property: "og:description",
        content:
          "Why Kenyans really left their jobs. Search workplace stories employer by employer.",
      },
    ],
  }),
  component: FeedPage,
});

const SORTS = [
  { key: "new", label: "Latest" },
  { key: "top", label: "Top rated" },
  { key: "trending", label: "Most discussed" },
] as const;

function FeedPage() {
  const { user } = useAuth();
  const watchedCompanies = useWatchedCompanies();
  const { data: filters } = useSuspenseQuery(filtersQuery);
  const { data: initialFeed } = useSuspenseQuery(feedQuery);
  const [sort, setSort] = useState<"new" | "top" | "trending">("new");
  const [industry, setIndustry] = useState<string | null>(null);
  const [county, setCounty] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [lens, setLens] = useState<null | "radar" | "following" | "saved" | "near">(null);
  const radarOnly = lens === "radar";
  const [nearSheetOpen, setNearSheetOpen] = useState(false);
  const nearMe = useNearMe();
  const fetchNearFeed = useServerFn(getNearMeFeed);
  const fetchLens = useServerFn(getLensStories);
  const [activeDiscussion, setActiveDiscussion] = useState<PublicStory | null>(null);
  const [pulseSheetOpen, setPulseSheetOpen] = useState(false);
  const { visibleCount, expandBy, resetVisibleCount } = useAutoCollapsingCount(20);

  /**
   * The unfiltered view reuses the data the loader already fetched, so the
   * server and the first client render agree (no hydration mismatch).
   */
  const isDefaultView = sort === "new" && industry === null && county === null && area === null;

  useEffect(() => resetVisibleCount(), [sort, industry, county, area, q, lens, resetVisibleCount]);

  // Bring the Near me lens back for members who left it on last time.
  const restoredNear = useRef(false);
  useEffect(() => {
    if (restoredNear.current || !nearMe.location) return;
    restoredNear.current = true;
    if (nearMe.on) setLens("near");
  }, [nearMe.location, nearMe.on]);

  // Without a location there is nothing to look near, so drop the lens once the sheet closes.
  useEffect(() => {
    if (lens === "near" && !nearSheetOpen && !nearMe.location) setLens(null);
  }, [lens, nearSheetOpen, nearMe.location]);

  const nearActive = lens === "near" && Boolean(nearMe.location);
  const lensActive = lens === "following" || lens === "saved";
  const pagedFeed = !nearActive && !lensActive;

  const nearFeed = useQuery({
    queryKey: [
      "near-me-feed",
      user?.uid ?? null,
      nearMe.location?.lat.toFixed(3),
      nearMe.location?.lng.toFixed(3),
      nearMe.radius,
    ],
    queryFn: () =>
      fetchNearFeed({
        data: { lat: nearMe.location!.lat, lng: nearMe.location!.lng, radiusKm: nearMe.radius },
      }),
    enabled: nearActive,
    staleTime: 60_000,
  });
  const lensFeed = useQuery({
    queryKey: ["lens-stories", user?.uid ?? null, lens],
    queryFn: () => fetchLens({ data: { lens: lens as "following" | "saved" } }),
    enabled: lensActive && Boolean(user?.emailVerified),
    staleTime: 30_000,
  });

  const feedPages = useInfiniteQuery({
    enabled: pagedFeed,
    queryKey: ["story-pages", user?.uid ?? null, sort, industry, county, area],
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: ({ pageParam }) =>
      sort === "new"
        ? listStoryPage({ data: { limit: 20, cursor: pageParam, industry, county, area } })
        : listStories({ data: { sort, industry, county, area, cursor: pageParam } }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    ...(!user && isDefaultView
      ? { initialData: { pages: [initialFeed], pageParams: [null] } }
      : {}),
  });
  const areaOptions = county ? (filters.areasByCounty[county] ?? []) : filters.areas;

  const needle = q.trim().toLowerCase();
  const sourceStories = (
    nearActive
      ? (nearFeed.data?.stories ?? [])
      : lensActive
        ? (lensFeed.data?.stories ?? [])
        : (feedPages.data?.pages.flatMap((page) => page.stories) ?? [])
  ) as PublicStory[];
  const feedPending = nearActive
    ? nearFeed.isPending
    : lensActive
      ? lensFeed.isPending
      : feedPages.isPending;
  const sameText = (a: string | null | undefined, b: string | null) =>
    (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  const stories = sourceStories.filter((story) => {
    // Near me, Following and Saved load their own lists, so the filters apply here instead.
    if (!pagedFeed) {
      if (industry && !sameText(story.industry, industry)) return false;
      if (county && !sameText(story.county, county)) return false;
      if (area && !sameText(story.area, area)) return false;
    }
    const matchesSearch = needle
      ? [
          story.title,
          story.body,
          story.company_name ?? "",
          ...((story as { reasons?: string[] }).reasons ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      : true;
    const matchesRadar =
      !radarOnly ||
      Boolean(
        (story.company_id && watchedCompanies.ids.has(story.company_id)) ||
          (story.company_slug && watchedCompanies.slugs.has(story.company_slug)),
      );
    return matchesSearch && matchesRadar;
  });

  function scrollToFeed() {
    requestAnimationFrame(() =>
      document.getElementById("feed")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const canReset =
    Boolean(needle) || industry !== null || county !== null || area !== null || sort !== "new" || lens !== null;

  return (
    <div className="space-y-5 md:space-y-8">
      <section className="mesh-hero animate-fade relative overflow-hidden rounded-3xl border border-border p-4 sm:p-6 md:p-12">
        <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)] lg:gap-12">
          <div>
            <h1 className="max-w-3xl text-3xl font-semibold leading-[1.05] sm:text-4xl md:text-6xl">
              The <span className="text-gradient">real reasons</span> Kenyans left their jobs.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:mt-4 sm:text-base md:text-lg">
              <span className="sm:hidden">
                Workplace stories, employer ratings and salary insights across Kenya.
              </span>
              <span className="hidden sm:inline">
                Exit stories, red-flag scores and salary honesty for employers across Nairobi,
                Mombasa, Kisumu and beyond. Research a company before you sign — or tell the story
                nobody let you tell at your exit interview.
              </span>
            </p>
            <div className="mt-4 flex flex-wrap gap-3 sm:mt-6">
              <Button asChild size="lg" className="glow-primary">
                <Link to="/post">
                  <PenLine className="size-4" /> Share your exit story
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="hidden sm:inline-flex">
                <Link to="/companies">Browse companies</Link>
              </Button>
            </div>
          </div>
          <div className="hidden lg:block">
            <CandidPulse
              onReason={(reason) => {
                setQ(reason);
                scrollToFeed();
              }}
              onStories={() => {
                setSort("new");
                scrollToFeed();
              }}
              onThisWeek={() => {
                setSort("trending");
                scrollToFeed();
              }}
            />
          </div>
        </div>
      </section>

      <FreePackageBanner />

      <button
        type="button"
        onClick={() => setPulseSheetOpen(true)}
        className="flex w-full items-center gap-2 rounded-2xl border border-border bg-card/75 px-3 py-2 text-left shadow-sm transition-colors hover:bg-card sm:gap-3 sm:px-4 sm:py-3 lg:hidden"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-10 sm:rounded-xl">
          <Activity className="size-4 sm:size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold sm:text-sm">Candid Pulse</span>
          <span className="block truncate text-xs text-muted-foreground">
            <span className="sm:hidden">Live workplace signals</span>
            <span className="hidden sm:inline">Live workplace signals from across Kenya</span>
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-primary" /> Live
        </span>
      </button>

      <Drawer open={pulseSheetOpen} onOpenChange={setPulseSheetOpen}>
        <DrawerContent className="max-h-[82dvh] overflow-y-auto rounded-t-[2rem] border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
          <DrawerHeader className="px-1 pb-4 text-left">
            <DrawerTitle>Candid Pulse</DrawerTitle>
            <DrawerDescription>Live workplace signals from across Kenya.</DrawerDescription>
          </DrawerHeader>
          <CandidPulse
            onReason={(reason) => {
              setQ(reason);
              setPulseSheetOpen(false);
              scrollToFeed();
            }}
            onStories={() => {
              setSort("new");
              setPulseSheetOpen(false);
              scrollToFeed();
            }}
            onThisWeek={() => {
              setSort("trending");
              setPulseSheetOpen(false);
              scrollToFeed();
            }}
          />
        </DrawerContent>
      </Drawer>

      <div
        className={`grid gap-6 ${activeDiscussion ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : "grid-cols-1"}`}
      >
        <div id="feed" className="min-w-0 scroll-mt-20 space-y-0">
          <FeedChips
            verified={Boolean(user?.emailVerified)}
            signedIn={Boolean(user)}
            lens={lens}
            sort={sort}
            radarCount={watchedCompanies.data?.length ?? 0}
            nearLabel={nearMe.location?.label ?? null}
            onLens={(next) => {
              setLens((current) => (current === next ? null : next));
              nearMe.setOn(false);
            }}
            onTrending={() => {
              if (lens === "following" || lens === "saved" || lens === "near") {
                setLens(null);
                nearMe.setOn(false);
                setSort("trending");
              } else setSort((current) => (current === "trending" ? "new" : "trending"));
            }}
            onNear={() => {
              if (lens === "near") {
                setLens(null);
                nearMe.setOn(false);
              } else {
                setLens("near");
                if (nearMe.location) nearMe.setOn(true);
                else setNearSheetOpen(true);
              }
            }}
          />
          {nearActive ? (
            <NearMePanel
              employers={(nearFeed.data?.employers ?? []) as NearEmployer[]}
              loading={nearFeed.isPending}
              onChange={() => setNearSheetOpen(true)}
            />
          ) : null}
          <NearMeSheet open={nearSheetOpen} onOpenChange={setNearSheetOpen} />
          <FilterBar
            query={q}
            onQueryChange={setQ}
            placeholder="Search stories, employers…"
            canReset={canReset}
            onReset={() => {
              setQ("");
              setIndustry(null);
              setCounty(null);
              setArea(null);
              setSort("new");
              setLens(null);
              nearMe.setOn(false);
            }}
            collapsibleFilters
            filters={[
              {
                id: "sort",
                label: "Sort",
                value: sort,
                required: true,
                options: SORTS.map((s) => s.key),
                optionLabel: (key) => SORTS.find((s) => s.key === key)?.label ?? key,
                onChange: (next) => setSort((next as typeof sort) ?? "new"),
              },
              {
                id: "industry",
                label: "Industry",
                value: industry,
                options: filters.industries,
                onChange: setIndustry,
              },
              {
                id: "county",
                label: "County",
                value: county,
                options: filters.counties,
                onChange: (next) => {
                  setCounty(next);
                  setArea(null);
                },
              },
              {
                id: "area",
                label: "Area",
                value: area,
                options: areaOptions,
                onChange: setArea,
              },
            ]}
          />

          {feedPending ? (
            <div className="space-y-4">
              <PulseLoader label="Loading stories" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-44 w-full rounded-2xl" />
              ))}
            </div>
          ) : stories.length === 0 ? (
            <p className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
              {nearActive
                ? `No stories within ${nearMe.radius} km yet. Try searching wider from Change above.`
                : lens === "following"
                  ? "No stories from people you follow yet. Follow members from their profiles to see their stories here."
                  : lens === "saved"
                    ? "You haven't saved any stories yet. Tap the bookmark on a story to keep it here."
                    : radarOnly && watchedCompanies.data?.length === 0
                ? "Your radar is empty. Track an employer from its company page to see their stories here."
                : radarOnly && feedPages.hasNextPage
                  ? "No tracked-company stories in this batch yet. Load more to continue scanning."
                  : radarOnly
                    ? "No stories from your tracked companies yet."
                    : "No stories match these filters yet."}
            </p>
          ) : (
            stories
              .slice(0, visibleCount)
              .map((story, index) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  index={index}
                  trackedCompany={Boolean(
                    (story.company_id && watchedCompanies.ids.has(story.company_id)) ||
                      (story.company_slug && watchedCompanies.slugs.has(story.company_slug)),
                  )}
                  discussionOpen={activeDiscussion?.id === story.id}
                  onToggleDiscussion={() =>
                    setActiveDiscussion((current) => (current?.id === story.id ? null : story))
                  }
                />
              ))
          )}
          {stories.length > visibleCount || (pagedFeed && feedPages.hasNextPage) ? (
            <div className="flex justify-center py-3">
              <Button
                variant="outline"
                onClick={(event) => {
                  if (visibleCount < stories.length) {
                    expandBy(20, event.currentTarget);
                  } else {
                    const anchor = event.currentTarget;
                    void feedPages.fetchNextPage().then((result) => {
                      if (result.isSuccess) expandBy(20, anchor);
                    });
                  }
                }}
                disabled={feedPages.isFetchingNextPage}
              >
                {feedPages.isFetchingNextPage
                  ? "Loading stories…"
                  : visibleCount < stories.length
                    ? "Show 20 more stories"
                    : "Load more stories"}
              </Button>
            </div>
          ) : null}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {activeDiscussion ? (
            <FeedDiscussionPanel
              key={`discussion-${activeDiscussion.id}`}
              story={activeDiscussion}
              onClose={() => setActiveDiscussion(null)}
            />
          ) : null}
        </AnimatePresence>
      </div>
      {!activeDiscussion ? (
        <aside className="mt-8 grid gap-4 border-t border-border/70 pt-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-primary" /> Most discussed
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {filters.companies.slice(0, 6).map((company) => (
                <li key={company.slug}>
                  <Link
                    to="/companies/$slug"
                    params={{ slug: company.slug }}
                    className="text-muted-foreground hover:text-primary"
                  >
                    {company.name}
                    {company.verified ? (
                      <CompanyVerifiedBadge className="ml-1 align-middle" />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function FeedChips({
  verified,
  signedIn,
  lens,
  sort,
  radarCount,
  nearLabel,
  onLens,
  onTrending,
  onNear,
}: {
  verified: boolean;
  signedIn: boolean;
  lens: null | "radar" | "following" | "saved" | "near";
  sort: "new" | "top" | "trending";
  radarCount: number;
  nearLabel: string | null;
  onLens: (lens: "radar" | "following" | "saved") => void;
  onTrending: () => void;
  onNear: () => void;
}) {
  const chip = (active: boolean) =>
    `h-9 shrink-0 gap-1.5 rounded-full px-3.5 text-sm ${active ? "" : "bg-background"}`;
  const renderGated = ({
    id,
    label,
    icon: Icon,
    count,
  }: {
    id: "radar" | "following" | "saved";
    label: string;
    icon: LucideIcon;
    count?: number;
  }) => {
    const active = lens === id;
    if (!verified) {
      return (
        <Button asChild variant="outline" className={chip(false)}>
          <Link to={signedIn ? "/verify-email" : "/auth"}>
            <Icon className="size-4" /> {label}
          </Link>
        </Button>
      );
    }
    return (
      <Button
        type="button"
        variant={active ? "default" : "outline"}
        aria-pressed={active}
        onClick={() => onLens(id)}
        className={chip(active)}
      >
        <Icon className={`size-4 ${active && id === "radar" ? "animate-pulse" : ""}`} />
        {label}
        {count !== undefined ? (
          <span className="tabular-nums opacity-75">{count}</span>
        ) : null}
      </Button>
    );
  };
  return (
    <div
      role="group"
      aria-label="Feed shortcuts"
      className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {renderGated({ id: "radar", label: "My Radar", icon: Radar, count: radarCount })}
      {renderGated({ id: "following", label: "Following", icon: UserCheck })}
      {renderGated({ id: "saved", label: "Saved", icon: Bookmark })}
      <Button
        type="button"
        variant={sort === "trending" && (lens === null || lens === "radar") ? "default" : "outline"}
        aria-pressed={sort === "trending" && (lens === null || lens === "radar")}
        onClick={onTrending}
        className={chip(sort === "trending" && (lens === null || lens === "radar"))}
      >
        <Flame className="size-4" /> Trending
      </Button>
      <Button
        type="button"
        variant={lens === "near" ? "default" : "outline"}
        aria-pressed={lens === "near"}
        onClick={onNear}
        className={chip(lens === "near")}
      >
        <Navigation className="size-4" />
        {lens === "near" && nearLabel ? `Near ${nearLabel}` : "Near me"}
      </Button>
    </div>
  );
}

function FreePackageBanner() {
  const { user, loading } = useAuth();
  const getOnboarding = useServerFn(getOnboardingState);
  const [dismissed, setDismissed] = useState(false);
  const { data } = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => getOnboarding(),
    enabled: Boolean(user) && !loading,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem("candid-free-welcome:" + user.uid) === "dismissed");
  }, [user?.uid]);

  if (
    dismissed ||
    !user ||
    data?.membership.tier !== "basic" ||
    data.membership.source !== "default" ||
    data.accountType === "official"
  )
    return null;

  return (
    <section className="relative flex items-center gap-3 border-y border-primary/25 bg-primary/10 px-4 py-3 sm:rounded-2xl sm:border sm:px-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Sparkles className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">You’re on Free</p>
        <p className="text-sm text-muted-foreground">
          Share stories, react, manage your posts and use privacy tools. Premium raises selected
          daily and monthly limits and lets you pin stories.
        </p>
      </div>
      <Button
        asChild
        size="sm"
        variant="outline"
        className="hidden shrink-0 rounded-full sm:inline-flex"
      >
        <Link to="/billing">View membership</Link>
      </Button>
      <button
        type="button"
        aria-label="Dismiss Free package notice"
        className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-background"
        onClick={() => {
          window.localStorage.setItem("candid-free-welcome:" + user.uid, "dismissed");
          setDismissed(true);
        }}
      >
        <X className="size-4" />
      </button>
    </section>
  );
}
