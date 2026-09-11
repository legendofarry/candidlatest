import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listCompanyScores } from "@/lib/public.functions";
import { FilterBar } from "@/components/site/filter-bar";
import { cn } from "@/lib/utils";

const companiesQuery = queryOptions({
  queryKey: ["company-scores"],
  queryFn: () => listCompanyScores(),
});

export const Route = createFileRoute("/companies/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(companiesQuery),
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold md:text-4xl">Company directory</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Every employer Kenyans have tagged here, with culture scores from anonymous ratings and
          AI-researched background.
        </p>
      </header>

      <FilterBar
        query={q}
        onQueryChange={setQ}
        placeholder="Search employers…"
        canReset={Boolean(q) || industry !== null || sort !== "discussed"}
        onReset={() => {
          setQ("");
          setIndustry(null);
          setSort("discussed");
        }}
        filters={[
          {
            id: "sort",
            label: "Sort",
            value: sort,
            required: true,
            options: ["discussed", "score", "az"],
            optionLabel: (key) =>
              key === "discussed" ? "Most discussed" : key === "score" ? "Best rated" : "A–Z",
            onChange: (next) => setSort((next as SortKey) ?? "discussed"),
          },
          {
            id: "industry",
            label: "Industry",
            value: industry,
            options: industries,
            onChange: setIndustry,
          },
        ]}
      />


      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {rows.map((company, index) => (
          <Link
            key={company.company_id}
            to="/companies/$slug"
            params={{ slug: company.slug ?? "" }}
            className="animate-rise rounded-2xl border border-border bg-card p-5 transition-transform hover:-translate-y-0.5"
            style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{company.name}</h2>
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
              {Number(company.story_count ?? 0)} stories · {Number(company.rating_count ?? 0)}{" "}
              ratings
              {company.would_work_again_pct !== null
                ? ` · ${Math.round(Number(company.would_work_again_pct))}% would work here again`
                : ""}
            </p>
          </Link>
        ))}
      </div>
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
