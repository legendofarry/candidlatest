import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowUpRight, Building2, Scale, Search } from "lucide-react";
import { listCompanyScores } from "@/lib/public.functions";
import { FilterBar } from "@/components/site/filter-bar";
import { cn, formatCount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { useAutoCollapsingCount } from "@/hooks/use-auto-collapsing-count";

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
  const [sort, setSort] = useState<SortKey>("discussed");
  const { visibleCount, expandBy, resetVisibleCount } = useAutoCollapsingCount(24);

  const industries = useMemo(
    () => [...new Set(data.companies.map((c) => c.industry).filter(Boolean))].sort() as string[],
    [data.companies],
  );

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
          <Button
            asChild
            className="mt-5 h-12 w-full rounded-full bg-lime-300 text-slate-950 shadow-none hover:bg-lime-200"
          >
            <Link to="/compare">
              <Scale className="size-4" /> Compare employers
            </Link>
          </Button>
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
              className="h-12 w-full rounded-full border border-border bg-[#f1f1ee] pl-12 pr-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-lime-200 px-4 py-2 text-sm font-semibold text-slate-900"
            >
              Most discussed
            </button>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              Industry
            </button>
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <header>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold md:text-4xl">Company directory</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Every employer Kenyans have tagged here, with culture scores from member ratings and
                AI-researched background.
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link to="/compare">
                <Scale className="size-4" /> Compare employers
              </Link>
            </Button>
          </div>
        </header>

        <FilterBar
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
          <div className="space-y-3 md:hidden">
            {visibleRows.map((company) => {
              const score = company.overall === null ? null : Number(company.overall);
              const accent =
                score === null
                  ? "bg-[#f0f0ee] text-slate-700"
                  : score >= 4.5
                    ? "bg-lime-300 text-slate-900"
                    : score >= 3.5
                      ? "bg-lime-200 text-slate-900"
                      : "bg-[#f1f1ee] text-slate-700";
              const initials = (company.name ?? "").trim().slice(0, 1).toUpperCase() || "?";
              const avatarTone = /[aeiou]/i.test(initials)
                ? "bg-[#b6f4e5]"
                : /[t]/i.test(initials)
                  ? "bg-[#b7e2ff]"
                  : "bg-[#d0eb6b]";
              return (
                <article
                  key={company.company_id}
                  className="rounded-[1.6rem] border border-border bg-card px-4 py-4 shadow-[0_6px_18px_rgba(0,0,0,.04)]"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-slate-900",
                        avatarTone,
                      )}
                    >
                      {initials}
                    </span>
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
                          {score === null ? "No score" : `★ ${score.toFixed(1)}/5`}
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

          <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleRows.map((company, index) => (
              <Link
                key={company.company_id}
                to="/companies/$slug"
                params={{ slug: company.slug ?? "" }}
                className="animate-rise rounded-2xl border border-border bg-card p-5 transition-transform hover:-translate-y-0.5"
                style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-1.5 font-semibold">
                      {company.name}
                      {company.verified ? <CompanyVerifiedBadge /> : null}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {company.industry} · {company.county}
                    </p>
                  </div>
                  <ScoreBadge value={company.overall} />
                </div>
                {company.descriptor ? (
                  <p className="mt-3 text-sm text-muted-foreground">{company.descriptor}</p>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  {formatCount(company.story_count)} stories · {formatCount(company.rating_count)}{" "}
                  ratings
                  {company.would_work_again_pct !== null
                    ? ` · ${Math.round(Number(company.would_work_again_pct))}% would work here again`
                    : ""}
                </p>
              </Link>
            ))}
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
