import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  MessageSquare,
  Plus,
  Scale,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { listCompanyScores, getSalaryCompanies } from "@/lib/public.functions";
import {
  describeRatingSample,
  describeSalaryEvidence,
  formatRatingScore,
} from "@/lib/company-comparison";
import { Button } from "@/components/ui/button";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { formatCount } from "@/lib/utils";

const compareQuery = queryOptions({
  queryKey: ["company-compare"],
  queryFn: async () => {
    const [scores, salaries] = await Promise.all([listCompanyScores(), getSalaryCompanies()]);
    return {
      companies: scores.companies,
      salaries: salaries.companies,
      employerError: scores.error,
      salaryError: salaries.error,
    };
  },
});

export const Route = createFileRoute("/compare")({
  loader: ({ context }) => context.queryClient.ensureQueryData(compareQuery),
  head: () => ({
    meta: [
      { title: "Compare employers | Candid" },
      {
        name: "description",
        content: "Compare worker-reported employer information side by side.",
      },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const { data } = useSuspenseQuery(compareQuery);
  const queryClient = useQueryClient();
  const companies = useMemo(
    () =>
      data.companies
        .filter(
          (
            company,
          ): company is typeof company & { company_id: string; name: string; slug: string } =>
            Boolean(company.company_id && company.name && company.slug),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.companies],
  );
  const [selected, setSelected] = useState<string[]>(() =>
    [...companies]
      .sort(
        (a, b) =>
          Number(b.story_count ?? 0) - Number(a.story_count ?? 0) ||
          Number(b.rating_count ?? 0) - Number(a.rating_count ?? 0),
      )
      .slice(0, 2)
      .map((company) => company.company_id),
  );

  function changeCompany(index: number, id: string) {
    setSelected((current) => current.map((item, itemIndex) => (itemIndex === index ? id : item)));
  }

  function addCompany() {
    const next = companies.find((company) => !selected.includes(company.company_id));
    if (next) setSelected((current) => [...current, next.company_id]);
  }

  function removeCompany(id: string) {
    setSelected((current) => current.filter((item) => item !== id));
  }

  return (
    <main className="mx-auto max-w-7xl space-y-7 pb-12">
      <header className="relative overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-primary/10 via-card to-cyan-500/10 p-6 sm:p-9">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/75 px-3 py-1.5 text-xs font-semibold text-primary">
            <Scale className="size-4" /> A clearer way to choose
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
            Compare employers.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Put worker-reported stories, ratings and salary information side by side before you make
            a career move.
          </p>
        </div>
        <Scale
          aria-hidden="true"
          className="absolute -right-5 -top-7 size-44 rotate-12 text-primary/10 sm:size-64"
        />
      </header>

      {data.employerError ? (
        <section
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="text-sm text-foreground">
            {data.employerError} The comparison hasn’t loaded, so this isn’t an empty company
            directory.
          </p>
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: compareQuery.queryKey })}
          >
            Try again
          </Button>
        </section>
      ) : null}
      {data.salaryError ? (
        <p
          role="status"
          className="rounded-2xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground"
        >
          Salary information is temporarily unavailable. The story and rating comparisons can still
          be viewed.
        </p>
      ) : null}

      {data.employerError ? null : companies.length < 2 ? (
        <section className="rounded-3xl border border-border bg-card p-8 text-center">
          <Building2 className="mx-auto size-8 text-primary" />
          <h2 className="mt-4 text-xl font-semibold">More employers are needed to compare</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            As workers share stories about more employers, you’ll be able to compare their reported
            experiences here.
          </p>
          <Button asChild className="mt-5">
            <Link to="/companies">Browse companies</Link>
          </Button>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Your comparison</h2>
              <p className="text-sm text-muted-foreground">Choose two or three employers.</p>
            </div>
            {selected.length < 3 && selected.length < companies.length ? (
              <Button variant="outline" onClick={addCompany}>
                <Plus className="size-4" /> Add employer
              </Button>
            ) : null}
          </div>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {selected.map((id, index) => {
              const company = companies.find((row) => row.company_id === id);
              const salary = data.salaries.find((row) => row.company_id === id);
              if (!company) return null;
              const salaryEvidence = describeSalaryEvidence(salary, Boolean(data.salaryError));
              const ratingCount = Number(company.rating_count ?? 0);
              return (
                <article
                  key={`${index}-${id}`}
                  className="min-w-0 overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
                >
                  <div className="border-b border-border bg-secondary/30 p-4 sm:p-5">
                    <div className="flex items-start gap-2">
                      <label className="sr-only" htmlFor={`company-${index}`}>
                        Employer {index + 1}
                      </label>
                      <select
                        id={`company-${index}`}
                        value={id}
                        onChange={(event) => changeCompany(index, event.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {companies
                          .filter(
                            (row) => row.company_id === id || !selected.includes(row.company_id),
                          )
                          .map((row) => (
                            <option key={row.company_id} value={row.company_id}>
                              {row.name}
                            </option>
                          ))}
                      </select>
                      {selected.length > 2 ? (
                        <button
                          type="button"
                          onClick={() => removeCompany(id)}
                          aria-label={`Remove ${company.name}`}
                          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-background hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {company.industry || "Industry not listed"} <span>·</span>{" "}
                      {company.county || "Location not listed"}
                      {company.verified ? <CompanyVerifiedBadge /> : null}
                    </div>
                  </div>

                  <div className="divide-y divide-border">
                    <CompareMetric
                      icon={MessageSquare}
                      label="Published stories"
                      value={formatCount(company.story_count)}
                      detail="Worker experiences shared; this count is not a workplace score."
                    />
                    <CompareMetric
                      icon={Users}
                      label="Employer ratings"
                      value={formatRatingScore(ratingCount, company.overall)}
                      detail={describeRatingSample(ratingCount)}
                    />
                    <div className="p-4 sm:p-5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Wallet className="size-4 text-primary" />
                        Reported salary
                      </div>
                      <p className="mt-2 text-lg font-semibold">{salaryEvidence.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{salaryEvidence.detail}</p>
                      {!data.salaryError && salary ? (
                        <Link
                          to="/salaries/$slug"
                          params={{ slug: company.slug }}
                          className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
                        >
                          View role-level salary data <ArrowUpRight className="ml-1 size-3.5" />
                        </Link>
                      ) : null}
                    </div>
                    <div className="p-4 sm:p-5">
                      <p className="text-xs text-muted-foreground">Would work here again</p>
                      <p className="mt-1 text-xl font-semibold">
                        {company.would_work_again_pct === null
                          ? "Not enough ratings"
                          : `${Math.round(Number(company.would_work_again_pct))}%`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {describeRatingSample(ratingCount)}
                      </p>
                    </div>
                  </div>

                  <Link
                    to="/companies/$slug"
                    params={{ slug: company.slug }}
                    className="flex items-center justify-between border-t border-border px-4 py-3 text-sm font-medium text-primary hover:bg-primary/5 sm:px-5"
                  >
                    Read company details <ArrowUpRight className="size-4" />
                  </Link>
                </article>
              );
            })}
          </section>

          <p className="rounded-2xl border border-border bg-secondary/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
            These are individual member reports, not guarantees about an employer or every
            employee’s experience. Read the stories behind the counts; missing or limited data does
            not mean a workplace is good or bad.
          </p>
        </>
      )}
    </main>
  );
}

function CompareMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof MessageSquare;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      <p className="mt-2 break-words text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
