import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Activity, Flame, PenLine, ShieldCheck, TrendingUp } from "lucide-react";
import { getFilterOptions, listStories } from "@/lib/public.functions";
import { StoryCard } from "@/components/site/story-card";
import type { PublicStory } from "@/components/site/story-card";
import { FeedDiscussionPanel } from "@/components/site/feed-discussion-panel";
import { PulseLoader } from "@/components/site/route-progress";
import { FilterBar } from "@/components/site/filter-bar";
import { CandidPulse } from "@/components/site/candid-pulse";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const feedQuery = queryOptions({
  queryKey: ["stories", "new"],
  queryFn: () => listStories({ data: { sort: "new" } }),
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
      { title: "Candid — anonymous exit stories from Kenyan workplaces" },
      {
        name: "description",
        content:
          "Read anonymous exit stories from Kenyan employees and research employers before you accept an offer. Pay, contracts, respect and workload — told by the people who left.",
      },
      { property: "og:title", content: "Candid — anonymous workplace exit stories" },
      {
        property: "og:description",
        content: "Why Kenyans really left their jobs. Anonymous, searchable, employer by employer.",
      },
    ],
  }),
  component: FeedPage,
});

const SORTS = [
  { key: "new", label: "Newest" },
  { key: "top", label: "Most upvoted" },
  { key: "trending", label: "Trending this week" },
] as const;

function FeedPage() {
  const { data: filters } = useSuspenseQuery(filtersQuery);
  const { data: initialFeed } = useSuspenseQuery(feedQuery);
  const [sort, setSort] = useState<"new" | "top" | "trending">("new");
  const [industry, setIndustry] = useState<string | null>(null);
  const [county, setCounty] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [activeDiscussion, setActiveDiscussion] = useState<PublicStory | null>(null);
  const [pulseSheetOpen, setPulseSheetOpen] = useState(false);

  /**
   * The unfiltered view reuses the data the loader already fetched, so the
   * server and the first client render agree (no hydration mismatch).
   */
  const isDefaultView = sort === "new" && industry === null && county === null;

  const { data, isPending } = useQuery({
    queryKey: ["stories", sort, industry, county],
    queryFn: () => listStories({ data: { sort, industry, county } }),
    ...(isDefaultView ? { initialData: initialFeed } : {}),
  });

  const needle = q.trim().toLowerCase();
  const stories = (data?.stories ?? []).filter((story) =>
    needle
      ? [
          story.title,
          story.body,
          story.company_name ?? "",
          ...((story as { reasons?: string[] }).reasons ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      : true,
  );

  function scrollToFeed() {
    requestAnimationFrame(() =>
      document.getElementById("feed")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const canReset = Boolean(needle) || industry !== null || county !== null || sort !== "new";

  return (
    <div className="space-y-5 md:space-y-8">
      <section className="mesh-hero animate-fade relative overflow-hidden rounded-3xl border border-border p-4 sm:p-6 md:p-12">
        <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)] lg:gap-12">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
              <ShieldCheck className="size-3.5 text-verified" /> Anonymous by design · Kenya
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-[1.05] sm:mt-4 sm:text-4xl md:text-6xl">
              The <span className="text-gradient">real reasons</span> Kenyans left their jobs.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:mt-4 sm:text-base md:text-lg">
              <span className="sm:hidden">
                Anonymous exit stories, employer ratings and salary insights across Kenya.
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div id="feed" className="min-w-0 scroll-mt-20 space-y-4">
          <FilterBar
            query={q}
            onQueryChange={setQ}
            placeholder="Search stories, employers…"
            canReset={canReset}
            onReset={() => {
              setQ("");
              setIndustry(null);
              setCounty(null);
              setSort("new");
            }}
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
                onChange: setCounty,
              },
            ]}
          />

          {isPending ? (
            <div className="space-y-4">
              <PulseLoader label="Loading stories" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-44 w-full rounded-2xl" />
              ))}
            </div>
          ) : stories.length === 0 ? (
            <p className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
              No stories match these filters yet.
            </p>
          ) : (
            stories.map((story, index) => (
              <StoryCard
                key={story.id}
                story={story}
                index={index}
                discussionOpen={activeDiscussion?.id === story.id}
                onToggleDiscussion={() =>
                  setActiveDiscussion((current) => (current?.id === story.id ? null : story))
                }
              />
            ))
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {activeDiscussion ? (
            <FeedDiscussionPanel
              key={`discussion-${activeDiscussion.id}`}
              story={activeDiscussion}
              onClose={() => setActiveDiscussion(null)}
            />
          ) : (
            <aside key="feed-highlights" className="space-y-4 lg:sticky lg:top-20 lg:self-start">
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
                        {company.verified ? <CompanyVerifiedBadge className="ml-1 align-middle" /> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Flame className="size-4 text-danger" /> Know your rights
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Unpaid salary, no contract or forced overtime? See what Kenyan labour law says.
                </p>
                <Link to="/rights" className="mt-2 inline-block font-medium text-danger">
                  Read the basics →
                </Link>
              </div>
            </aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
