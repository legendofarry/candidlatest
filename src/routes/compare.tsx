import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  Info,
  MessageSquare,
  Plus,
  Scale,
  Star,
  ThumbsUp,
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
import { cn, formatCount } from "@/lib/utils";

const mobileCompareColors = [
  { badge: "bg-[#a7dd18]", bar: "bg-[#a7dd18]" },
  { badge: "bg-[#00b8c0]", bar: "bg-[#00b8c0]" },
  { badge: "bg-orange-400", bar: "bg-orange-400" },
];

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

  const compareRows = selected.flatMap((id, index) => {
    const company = companies.find((row) => row.company_id === id);
    if (!company) return [];
    const salary = data.salaries.find((row) => row.company_id === id);
    return [
      {
        company,
        index,
        salary,
        salaryEvidence: describeSalaryEvidence(salary, Boolean(data.salaryError)),
      },
    ];
  });
  const maxStories = Math.max(
    1,
    ...compareRows.map(({ company }) => Number(company.story_count ?? 0)),
  );
  const maxSalaryReports = Math.max(
    1,
    ...compareRows.map(({ salary }) => Number(salary?.contributions ?? 0)),
  );

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-2 pb-28 md:space-y-7 md:px-0 md:pb-12">
      <header className="relative overflow-hidden rounded-[1.8rem] bg-[#09170e] p-5 text-white md:hidden">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-lime-400 px-3 py-1.5 text-xs font-semibold text-slate-950">
            A clearer way to choose
          </div>
          <h1 className="mt-4 max-w-[15rem] font-display text-3xl font-semibold leading-tight tracking-tight">
            Compare employers.
          </h1>
          <p className="mt-2 max-w-[19rem] text-sm leading-5 text-slate-300">
            Worker stories, ratings and pay — side by side.
          </p>
        </div>
        <Scale
          aria-hidden="true"
          className="absolute -right-4 -top-1 size-28 rotate-12 text-white/[0.08]"
        />
      </header>

      <header className="relative hidden overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-primary/10 via-card to-cyan-500/10 p-6 sm:p-9 md:block">
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
          <section className="space-y-4 md:hidden">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Your lineup</h2>
              <span className="text-xs text-muted-foreground">{selected.length}/3 selected</span>
            </div>
            <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {compareRows.map(({ company, index }) => (
                <article
                  key={`${company.company_id}-${index}`}
                  className="relative w-40 shrink-0 rounded-[1.6rem] bg-card p-4 shadow-[0_6px_18px_rgba(0,0,0,.045)]"
                >
                  <span
                    className={cn(
                      "flex size-11 items-center justify-center rounded-full text-base font-bold text-slate-950",
                      mobileCompareColors[index % mobileCompareColors.length].badge,
                    )}
                  >
                    {company.name.slice(0, 1).toUpperCase()}
                  </span>
                  {selected.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => removeCompany(company.company_id)}
                      aria-label={`Remove ${company.name}`}
                      className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                  <label className="sr-only" htmlFor={`mobile-company-${index}`}>
                    Employer {index + 1}
                  </label>
                  <select
                    id={`mobile-company-${index}`}
                    value={company.company_id}
                    onChange={(event) => changeCompany(index, event.target.value)}
                    className="mt-3 w-full truncate bg-transparent text-base font-semibold outline-none"
                  >
                    {companies
                      .filter(
                        (row) =>
                          row.company_id === company.company_id ||
                          !selected.includes(row.company_id),
                      )
                      .map((row) => (
                        <option key={row.company_id} value={row.company_id}>
                          {row.name}
                        </option>
                      ))}
                  </select>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
                    {company.industry || "Industry not listed"}
                    {company.county ? (
                      <>
                        <br />
                        {company.county}
                      </>
                    ) : null}
                  </p>
                </article>
              ))}
              {selected.length < 3 && selected.length < companies.length ? (
                <button
                  type="button"
                  onClick={addCompany}
                  className="flex w-40 shrink-0 flex-col items-center justify-center gap-2 rounded-[1.6rem] border-2 border-dashed border-border px-4 py-4 text-sm font-medium text-muted-foreground"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-lime-400 text-slate-950">
                    <Plus className="size-5" />
                  </span>
                  Add employer
                </button>
              ) : null}
            </div>
          </section>

          <section className="space-y-3 md:hidden">
            <MobileCompareMetric
              icon={BookOpen}
              title="Published stories"
              note="Experiences shared — not a score."
              rows={compareRows.map(({ company, index }) => {
                const count = Number(company.story_count ?? 0);
                return {
                  name: company.name,
                  value: formatCount(count),
                  percent: (count / maxStories) * 100,
                  color: mobileCompareColors[index % mobileCompareColors.length].bar,
                };
              })}
            />
            <MobileCompareMetric
              icon={Star}
              title="Employer rating"
              note="Small samples are early signals."
              rows={compareRows.map(({ company, index }) => {
                const count = Number(company.rating_count ?? 0);
                const score =
                  company.overall !== null && Number.isFinite(company.overall)
                    ? Number(company.overall)
                    : null;
                return {
                  name: company.name,
                  value: score === null || count <= 0 ? "—" : score.toFixed(1),
                  caption: `${count} resp.`,
                  percent: score === null ? 0 : (score / 5) * 100,
                  color: mobileCompareColors[index % mobileCompareColors.length].bar,
                };
              })}
            />
            <MobileCompareMetric
              icon={Wallet}
              title="Salary reports"
              note={
                data.salaryError
                  ? "Salary information is temporarily unavailable."
                  : "Missing data isn't a pay assessment."
              }
              rows={compareRows.map(({ company, index, salary, salaryEvidence }) => {
                const count = Number(salary?.contributions ?? 0);
                return {
                  name: company.name,
                  value: data.salaryError ? "Unavailable" : count > 0 ? formatCount(count) : "None",
                  percent: (count / maxSalaryReports) * 100,
                  color: mobileCompareColors[index % mobileCompareColors.length].bar,
                  empty: !data.salaryError && count <= 0,
                  detail: salaryEvidence.detail,
                };
              })}
            />
            <MobileCompareMetric
              icon={ThumbsUp}
              title="Would work here again"
              note="Based on member responses."
              rows={compareRows.map(({ company, index }) => {
                const percent =
                  company.would_work_again_pct === null
                    ? null
                    : Math.round(Number(company.would_work_again_pct));
                return {
                  name: company.name,
                  value: percent === null ? "—" : `${percent}%`,
                  percent: percent ?? 0,
                  color: mobileCompareColors[index % mobileCompareColors.length].bar,
                };
              })}
            />
          </section>

          <p className="flex gap-2 rounded-[1.4rem] bg-secondary/60 px-4 py-3 text-xs leading-5 text-muted-foreground md:hidden">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              These are individual member reports, not guarantees. Limited data doesn’t mean a
              workplace is good or bad.
            </span>
          </p>

          <div className="fixed inset-x-0 bottom-0 z-30 bg-background/95 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
            <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {compareRows.map(({ company }) => (
                <Link
                  key={company.company_id}
                  to="/companies/$slug"
                  params={{ slug: company.slug }}
                  className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[#09170e] px-4 text-sm font-medium text-white"
                >
                  {company.name} <ArrowUpRight className="size-4 text-lime-300" />
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden flex-wrap items-center justify-between gap-3 md:flex">
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

          <section className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
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

          <p className="hidden rounded-2xl border border-border bg-secondary/30 px-4 py-3 text-xs leading-5 text-muted-foreground md:block">
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

function MobileCompareMetric({
  icon: Icon,
  title,
  note,
  rows,
}: {
  icon: typeof BookOpen;
  title: string;
  note: string;
  rows: {
    name: string;
    value: string;
    percent: number;
    color: string;
    caption?: string;
    detail?: string;
    empty?: boolean;
  }[];
}) {
  return (
    <article className="rounded-[1.5rem] bg-card p-4 shadow-[0_6px_18px_rgba(0,0,0,.045)]">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-foreground">
          <Icon className="size-4" />
        </span>
        {title}
      </h3>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div
            key={row.name}
            className="grid grid-cols-[88px_minmax(0,1fr)_44px] items-center gap-3"
          >
            <span className="truncate text-xs text-muted-foreground">{row.name}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  row.empty ? "bg-secondary" : row.color,
                )}
                style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }}
              />
            </div>
            <span className="text-right text-sm font-semibold leading-tight">
              {row.value}
              {row.caption ? (
                <span className="block text-[10px] font-normal text-muted-foreground">
                  {row.caption}
                </span>
              ) : null}
            </span>
            {row.detail ? (
              <span className="sr-only col-start-1 col-end-4">{row.detail}</span>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-4 text-muted-foreground">{note}</p>
    </article>
  );
}
