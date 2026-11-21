import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  Building2,
  Check,
  ListFilter,
  Scale,
  Search,
  SlidersHorizontal,
  Star,
  TrendingUp,
} from "lucide-react";
import { listCompanyScores } from "@/lib/public.functions";
import { FilterBar } from "@/components/site/filter-bar";
import { cn, formatCount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/site/company-logo";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { useAutoCollapsingCount } from "@/hooks/use-auto-collapsing-count";
import { getCompanyBrand } from "@/lib/company-branding";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";

const companiesQuery = queryOptions({
  queryKey: ["company-scores"],
  queryFn: () => listCompanyScores(),
  staleTime: 0,
});

export const Route = createFileRoute("/companies/")({
  loader: ({ context }) => context.queryClient.fetchQuery(companiesQuery),
  head: () => ({
    meta: [
      { title: "Kenyan company directory — culture scores & red flags | Candid" },
      {
        name: "description",
        content:
          "Search Kenyan employers by industry and county. See culture scores for pay punctuality, statutory compliance, respect, workload and growth before you accept an offer.",
      },
      { property: "og:title", content: "Kenyan company directory — culture scores & red flags" },
      {
        property: "og:description",
        content: "Every employer tagged on Candid, with scores and AI-researched profiles.",
      },
    ],
  }),
  component: CompaniesPage,
});

type SortKey = "az" | "score" | "discussed";

function CompaniesPage() {
  const { data } = useSuspenseQuery(companiesQuery);
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState<string | null>(null);
  const [industryDrawerOpen, setIndustryDrawerOpen] = useState(false);
  const [industrySearch, setIndustrySearch] = useState("");
  const [sortDrawerOpen, setSortDrawerOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("discussed");
  const { visibleCount, expandBy, resetVisibleCount } = useAutoCollapsingCount(24);

  const industries = useMemo(
    () => [...new Set(data.companies.map((c) => c.industry).filter(Boolean))].sort() as string[],
    [data.companies],
  );
  const filteredIndustries = industries.filter((item) =>
    item.toLocaleLowerCase().includes(industrySearch.trim().toLocaleLowerCase()),
  );
  const sortOptions = [
    { value: "discussed", label: "Most discussed", icon: TrendingUp },
    { value: "score", label: "Best rated", icon: Star },
    { value: "az", label: "A–Z", icon: ListFilter },
  ] as const;
  const selectedSort = sortOptions.find((option) => option.value === sort) ?? sortOptions[0];

  const rows = useMemo(() => {
    let list = data.companies.filter((c) =>
      q ? (c.name ?? "").toLowerCase().includes(q.toLowerCase()) : true,
    );
    if (industry) list = list.filter((c) => c.industry === industry);
    return [...list].sort((a, b) => {
      if (sort === "az") return (a.name ?? "").localeCompare(b.name ?? "");
      if (sort === "score") return Number(b.overall ?? 0) - Number(a.overall ?? 0);
      return Number(b.story_count ?? 0) - Number(a.story_count ?? 0);
    });
  }, [data.companies, q, industry, sort]);
  const visibleRows = rows.slice(0, visibleCount);

  function resetFilters() {
    setQ("");
    setIndustry(null);
    setSort("discussed");
    resetVisibleCount();
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="md:hidden">
        <section className="overflow-hidden rounded-[1.9rem] bg-gradient-to-br from-[#0b1a0f] via-[#0d1e11] to-[#2d4a18] px-5 py-5 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lime-200/90">
            Directory
          </div>
          <h1 className="mt-3 font-display text-[2.4rem] font-semibold leading-[0.9] tracking-tight">
            Company directory
          </h1>
          <p className="mt-3 max-w-[18rem] text-[1rem] leading-6 text-white/75">
            Every employer Kenyans have tagged here, with culture scores from member ratings and
            AI-researched background.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button
              asChild
              className="h-12 rounded-full bg-lime-300 text-slate-950 shadow-none hover:bg-lime-200"
            >
              <Link to="/compare">
                <Scale className="size-4" /> Compare
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-full border-white/30 bg-white/10 text-white hover:bg-white/15 hover:text-white"
            >
              <Link to="/companies/watched">
                <Bell className="size-4" /> Watched
              </Link>
            </Button>
          </div>
        </section>

        <div className="mt-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                resetVisibleCount();
              }}
              placeholder="Search employers..."
              className="h-12 w-full rounded-full border border-border bg-[#f1f1ee] pl-12 pr-4 text-base text-slate-950 placeholder:text-slate-500 focus:outline-none"
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={sortDrawerOpen}
              onClick={() => setSortDrawerOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-lime-200 px-4 py-2 text-sm font-semibold text-slate-900 transition-transform active:scale-95"
            >
              <selectedSort.icon className="size-4" />
              {selectedSort.label}
            </button>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={industryDrawerOpen}
              onClick={() => setIndustryDrawerOpen(true)}
              className={cn(
                "inline-flex max-w-[70vw] shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                industry
                  ? "border-lime-200 bg-lime-200 text-slate-900"
                  : "border-border bg-transparent text-muted-foreground",
              )}
            >
              <SlidersHorizontal className="size-4 shrink-0" />
              <span className="truncate">{industry ?? "Industry"}</span>
            </button>
          </div>
        </div>
        <Drawer
          open={industryDrawerOpen}
          onOpenChange={(open) => {
            setIndustryDrawerOpen(open);
            if (!open) setIndustrySearch("");
          }}
        >
          <DrawerContent className="h-[min(78dvh,38rem)] max-h-[85dvh] overflow-hidden rounded-t-[1.5rem] border-border bg-background">
            <DrawerHeader className="shrink-0 pb-3 text-left">
              <DrawerTitle className="font-display">Industry</DrawerTitle>
              <DrawerDescription>
                {industry
                  ? `Showing ${industry} employers`
                  : "Choose an industry to filter employers"}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={industrySearch}
                  onChange={(event) => setIndustrySearch(event.target.value)}
                  placeholder="Search industries"
                  aria-label="Search industries"
                  className="h-11 rounded-xl pl-10"
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                aria-pressed={industry === null}
                onClick={() => {
                  setIndustry(null);
                  resetVisibleCount();
                  setIndustryDrawerOpen(false);
                  setIndustrySearch("");
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors hover:bg-secondary/70"
              >
                <span className="min-w-0 flex-1">All industries</span>
                {industry === null ? <Check className="size-4 text-primary" /> : null}
              </button>
              {filteredIndustries.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={industry === item}
                  onClick={() => {
                    setIndustry(item);
                    resetVisibleCount();
                    setIndustryDrawerOpen(false);
                    setIndustrySearch("");
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors hover:bg-secondary/70"
                >
                  <span className="min-w-0 flex-1">{item}</span>
                  {industry === item ? <Check className="size-4 text-primary" /> : null}
                </button>
              ))}
              {filteredIndustries.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No industries found.
                </p>
              ) : null}
            </div>
          </DrawerContent>
        </Drawer>
        <Drawer open={sortDrawerOpen} onOpenChange={setSortDrawerOpen}>
          <DrawerContent className="max-h-[70dvh] overflow-hidden rounded-t-[1.5rem] border-border bg-background">
            <DrawerHeader className="shrink-0 pb-3 text-left">
              <DrawerTitle className="font-display">Sort employers</DrawerTitle>
              <DrawerDescription>Choose how employers are ordered.</DrawerDescription>
            </DrawerHeader>
            <div className="space-y-1 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {sortOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sort === value}
                  onClick={() => {
                    setSort(value);
                    resetVisibleCount();
                    setSortDrawerOpen(false);
                  }}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors",
                    sort === value
                      ? "bg-primary/10 font-medium text-primary"
                      : "hover:bg-secondary/70",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">{label}</span>
                  {sort === value ? <Check className="size-4" /> : null}
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <div className="hidden md:block">
        <header className="relative isolate overflow-hidden border-y border-border/70 py-7 lg:py-9">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-32 size-96 rounded-full bg-[radial-gradient(circle,_rgba(199,255,0,0.12),_transparent_68%)]"
          />
          <div className="relative flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                <span className="size-1.5 rounded-full bg-primary shadow-[0_0_14px_rgba(199,255,0,.7)]" />
                Candid · Employer directory
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.045em] lg:text-5xl">
                Company directory<span className="text-primary">.</span>
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Every employer Kenyans have tagged here, with culture scores from member ratings and
                AI-researched background.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-xl border-border/80 bg-background/60 px-4"
              >
                <Link to="/companies/watched">
                  <Bell className="size-4" /> Watched
                </Link>
              </Button>
              <Button
                asChild
                className="h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground shadow-[0_8px_30px_-12px_rgba(199,255,0,.65)] hover:bg-primary/90"
              >
                <Link to="/compare">
                  <Scale className="size-4" /> Compare employers
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <FilterBar
          className="md:mx-0 md:rounded-2xl md:border md:border-border/70 md:bg-background/90 md:px-4 md:py-3 md:shadow-sm"
          query={q}
          onQueryChange={(value) => {
            setQ(value);
            resetVisibleCount();
          }}
          placeholder="Search employers…"
          canReset={Boolean(q) || industry !== null || sort !== "discussed"}
          onReset={resetFilters}
          filters={[
            {
              id: "sort",
              label: "Sort",
              value: sort,
              required: true,
              options: ["discussed", "score", "az"],
              optionLabel: (key) =>
                key === "discussed" ? "Most discussed" : key === "score" ? "Best rated" : "A–Z",
              onChange: (next) => {
                setSort((next as SortKey) ?? "discussed");
                resetVisibleCount();
              },
            },
            {
              id: "industry",
              label: "Industry",
              value: industry,
              options: industries,
              onChange: (next) => {
                setIndustry(next);
                resetVisibleCount();
              },
            },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <section className="border-y border-border py-10 text-center sm:py-14">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {data.companies.length === 0 ? (
              <Building2 className="size-6" />
            ) : (
              <Search className="size-6" />
            )}
          </span>
          <h2 className="mt-4 text-lg font-semibold">
            {data.companies.length === 0
              ? "The directory is just getting started"
              : "No employers match"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {data.companies.length === 0
              ? "Employers will appear here as workers share stories. Be the first to add one."
              : "Try a different search or clear your filters to see more companies."}
          </p>
          {data.companies.length === 0 ? (
            <Button asChild size="sm" className="mt-5">
              <Link to="/post">Share the first story</Link>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-5"
              onClick={resetFilters}
            >
              Clear search and filters
            </Button>
          )}
        </section>
      ) : (
        <>
          <div className="mb-3 mt-7 hidden items-end justify-between gap-4 border-b border-border/70 pb-3 md:flex">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                Candid directory
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                Employers to explore
              </h2>
            </div>
            <p className="pb-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{formatCount(visibleRows.length)}</span>
              {" employers shown · "}
              {formatCount(rows.length)} matching
            </p>
          </div>
          <div className="space-y-3 md:hidden">
            {visibleRows.map((company) => {
              const score = company.overall === null ? null : Number(company.overall);
              const brand = getCompanyBrand(company.name);
              const accent =
                score === null
                  ? "bg-[#f0f0ee] text-slate-700"
                  : score >= 4.5
                    ? "bg-lime-300 text-slate-900"
                    : score >= 3.5
                      ? "bg-lime-200 text-slate-900"
                      : "bg-[#f1f1ee] text-slate-700";
              return (
                <article
                  key={company.company_id}
                  className="rounded-[1.6rem] border border-border bg-card px-4 py-4 shadow-[0_6px_18px_rgba(0,0,0,.04)]"
                  style={brand ? { borderLeftWidth: 3, borderLeftColor: brand.color } : undefined}
                >
                  <div className="flex items-start gap-3">
                    <CompanyLogo name={company.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate text-xl font-semibold leading-none">
                            {company.name}
                          </h2>
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {company.industry || "Industry not listed"} ·{" "}
                            {company.county || "Location not listed"}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                            accent,
                          )}
                        >
                          {score === null ? "" : `★ ${score.toFixed(1)}/5`}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {company.story_count
                          ? `${formatCount(company.story_count)} story`
                          : "1 story"}{" "}
                        ·{" "}
                        {company.would_work_again_pct !== null
                          ? `${Math.round(Number(company.would_work_again_pct))}% would work here again`
                          : "No ratings"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      asChild
                      variant="secondary"
                      className="flex-1 rounded-full bg-[#f2f3ee] text-slate-900 hover:bg-[#e7e8e2]"
                    >
                      <Link to="/companies/$slug" params={{ slug: company.slug ?? "" }}>
                        View profile
                      </Link>
                    </Button>
                    <Button
                      asChild
                      className="flex-1 rounded-full bg-[#09170e] text-white hover:bg-[#14251a]"
                    >
                      <Link to="/compare">
                        Compare <ArrowUpRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleRows.map((company, index) => {
              const brand = getCompanyBrand(company.name);
              return (
                <Link
                  key={company.company_id}
                  to="/companies/$slug"
                  params={{ slug: company.slug ?? "" }}
                  className="group relative flex min-h-[218px] flex-col overflow-hidden rounded-[1.35rem] border border-border/80 border-t-2 border-t-transparent bg-card/70 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:bg-card hover:shadow-[0_18px_48px_-30px_rgba(199,255,0,.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 animate-rise"
                  style={{
                    animationDelay: `${Math.min(index, 8) * 50}ms`,
                    ...(brand ? { borderTopColor: brand.color } : {}),
                  }}
                >
                  <div className="flex items-start gap-3.5">
                    <CompanyLogo name={company.name} sizeClassName="size-14 rounded-2xl" />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <h2 className="flex items-center gap-1.5 pr-1 font-display text-lg font-semibold leading-tight tracking-tight group-hover:text-primary">
                        <span className="line-clamp-2">{company.name}</span>
                        {company.verified ? <CompanyVerifiedBadge /> : null}
                      </h2>
                      <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">
                        {company.industry || "Industry not listed"}
                        <span className="mx-1.5 text-border">·</span>
                        {company.county || "Kenya"}
                      </p>
                    </div>
                    <ScoreBadge value={company.overall} />
                  </div>
                  {company.descriptor ? (
                    <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
                      {company.descriptor}
                    </p>
                  ) : (
                    <p className="mt-4 min-h-10 text-sm leading-5 text-muted-foreground">
                      Explore workplace stories and ratings from Candid members.
                    </p>
                  )}
                  {company.would_work_again_pct !== null ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {Math.round(Number(company.would_work_again_pct))}%
                      </span>{" "}
                      would work here again
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/70 pt-4">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {formatCount(company.story_count)}
                      </span>{" "}
                      stories
                      <span className="mx-1.5 text-border">·</span>
                      <span className="font-semibold text-foreground">
                        {formatCount(company.rating_count)}
                      </span>{" "}
                      ratings
                    </p>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-all group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground">
                      <ArrowUpRight className="size-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
      {rows.length > 0 ? (
        <div className="flex flex-col items-center gap-2 pb-4 md:pb-0">
          <p className="text-xs text-muted-foreground">
            Showing {formatCount(visibleRows.length)} of {formatCount(rows.length)} employers
          </p>
          {rows.length > visibleRows.length ? (
            <Button variant="outline" onClick={(event) => expandBy(24, event.currentTarget)}>
              Show 24 more employers
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ScoreBadge({ value }: { value: number | string | null }) {
  if (value === null) {
    return <span className="rounded-full border border-border px-2 py-1 text-xs">No score</span>;
  }
  const score = Number(value);
  const tone = score >= 3.5 ? "text-verified" : score >= 2.5 ? "text-primary" : "text-danger";
  return (
    <span
      className={cn("rounded-full border border-border px-2.5 py-1 text-sm font-semibold", tone)}
    >
      {score.toFixed(1)}/5
    </span>
  );
}
