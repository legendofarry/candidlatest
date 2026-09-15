import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Flame, PenLine, ShieldCheck, TrendingUp } from "lucide-react";
import { getFilterOptions, listStories } from "@/lib/public.functions";
import { StoryCard } from "@/components/site/story-card";
import { PulseLoader } from "@/components/site/route-progress";
import { FilterBar } from "@/components/site/filter-bar";
import { CandidPulse } from "@/components/site/candid-pulse";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
      ? [story.title, story.body, story.company_name ?? ""].join(" ").toLowerCase().includes(needle)
      : true,
  );

  const canReset = Boolean(needle) || industry !== null || county !== null || sort !== "new";

  return (
    <div className="space-y-8">
      <section className="mesh-hero animate-fade relative overflow-hidden rounded-3xl border border-border p-6 md:p-12">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] lg:gap-12">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-verified" /> Anonymous by design · Kenya
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] md:text-6xl">
              The <span className="text-gradient">real reasons</span> Kenyans left their jobs.
            </h1>
            <p className="mt-4 max-w-2xl text-muted-foreground md:text-lg">
              Exit stories, red-flag scores and salary honesty for employers across Nairobi,
              Mombasa, Kisumu and beyond. Research a company before you sign — or tell the story
              nobody let you tell at your exit interview.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" className="glow-primary">
                <Link to="/post">
                  <PenLine className="size-4" /> Share your exit story
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/companies">Browse companies</Link>
              </Button>
            </div>
          </div>
          <CandidPulse />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] xl:grid-cols-[minmax(0,1fr)_minmax(240px,320px)] 2xl:grid-cols-[minmax(640px,1fr)_320px]">
        <div className="min-w-0 space-y-4">
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
            stories.map((story, index) => <StoryCard key={story.id} story={story} index={index} />)
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
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
      </div>
    </div>
  );
}
