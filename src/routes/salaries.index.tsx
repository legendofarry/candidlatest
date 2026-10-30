import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  LockKeyhole,
  MapPin,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { notify as toast } from "@/lib/notifications-store";
import { getSalaryCompanies } from "@/lib/public.functions";
import {
  getMyParticipatingCompanyIds,
  getMySalaryCompanyIds,
  submitSalary,
} from "@/lib/actions.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCount } from "@/lib/utils";
import { useAutoCollapsingCount } from "@/hooks/use-auto-collapsing-count";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const salaryCompaniesQuery = queryOptions({
  queryKey: ["salary-companies-v2"],
  queryFn: () => getSalaryCompanies(),
});

export const Route = createFileRoute("/salaries/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(salaryCompaniesQuery),
  head: () => ({
    meta: [
      { title: "Kenyan salaries by employer | Candid" },
      {
        name: "description",
        content:
          "Browse Kenyan employers and see worker-reported pay ranges broken down by position, with contributor counts for every role.",
      },
      { property: "og:title", content: "Salary honesty by employer — Candid" },
      {
        property: "og:description",
        content:
          "Company-first salary data from Kenyan workers. Ranges appear only once enough people contribute.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalaryDirectory,
});

export const kes = (value: number) => `KES ${Math.round(value).toLocaleString("en-KE")}`;

type SalaryStatus = "all" | "live" | "building" | "none";
type SalaryCompany = Awaited<ReturnType<typeof getSalaryCompanies>>["companies"][number];

function SalaryDirectory() {
  const { data } = useSuspenseQuery(salaryCompaniesQuery);
  // Persisted client caches can contain the earlier directory response shape.
  const companies = useMemo(
    () =>
      data.companies.map((row) => {
        const positionSummaries = row.position_summaries ?? [];
        return {
          ...row,
          positions: row.positions ?? positionSummaries.length,
          position_summaries: positionSummaries,
        };
      }),
    [data.companies],
  );
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SalaryStatus>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeCompany, setActiveCompany] = useState<SalaryCompany | null>(null);
  const { visibleCount, expandBy, resetVisibleCount } = useAutoCollapsingCount(20);

  const eligibleCompanies = useQuery({
    queryKey: ["participating-companies", user?.uid],
    queryFn: () => getMyParticipatingCompanyIds(),
    enabled: Boolean(user),
  });
  const mySubmissions = useQuery({
    queryKey: ["my-salary-companies", user?.uid],
    queryFn: () => getMySalaryCompanyIds(),
    enabled: Boolean(user),
  });
  const eligibleCompanyIds = useMemo(
    () => new Set(eligibleCompanies.data ?? []),
    [eligibleCompanies.data],
  );
  const submittedCompanyIds = useMemo(
    () => new Set(mySubmissions.data ?? []),
    [mySubmissions.data],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    return companies
      .filter((row) =>
        !needle || `${row.name} ${row.industry ?? ""} ${row.county ?? ""}`.toLocaleLowerCase().includes(needle),
      )
      .filter((row) => {
        const hasReports = row.contributions > 0;
        const hasLiveRange = row.position_summaries.some((position) => position.range_visible);
        return status === "all"
          ? true
          : status === "live"
            ? hasLiveRange
            : status === "building"
              ? hasReports && !hasLiveRange
              : !hasReports;
      });
  }, [companies, q, status]);
  const visibleRows = rows.slice(0, visibleCount);
  const totalReports = companies.reduce((sum, row) => sum + row.contributions, 0);
  const totalPositions = companies.reduce((sum, row) => sum + row.positions, 0);
  const liveCompanies = companies.filter((row) =>
    row.position_summaries.some((position) => position.range_visible),
  ).length;

  const filters: { value: SalaryStatus; label: string }[] = [
    { value: "all", label: "All employers" },
    { value: "live", label: "Ranges live" },
    { value: "building", label: "Building up" },
    { value: "none", label: "No reports" },
  ];

  return (
    <div className="min-w-0 space-y-4 overflow-x-clip bg-[#f5f6f1] pb-8 text-[#102015] dark:bg-background dark:text-foreground md:bg-transparent">
      <header className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(145deg,#142b17_0%,#09160d_72%)] px-6 py-6 text-white shadow-sm sm:px-8 sm:py-8">
        <Wallet className="absolute -right-4 -top-3 size-32 rotate-[-12deg] text-lime-200/10 sm:size-40" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-200">Salaries</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Salary honesty
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">
          See what people are paid, position by position. Typical ranges appear only after enough
          people contribute, so individual salaries stay private.
        </p>
        <div className="mt-5 grid max-w-lg grid-cols-3 gap-2">
          <SummaryStat value={formatCount(totalReports)} label="Reports" />
          <SummaryStat value={formatCount(liveCompanies)} label="Ranges live" />
          <SummaryStat value={formatCount(totalPositions)} label="Positions" />
        </div>
      </header>

      <section className="sticky top-16 z-30 -mx-2 space-y-2 bg-[#f5f6f1]/95 px-2 py-2 backdrop-blur-md dark:bg-background/95 md:mx-0 md:px-0">
        <label className="relative block">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              resetVisibleCount();
            }}
            placeholder="Search employer, industry or county"
            className="h-12 rounded-full border-0 bg-white pl-11 shadow-sm dark:border dark:border-border dark:bg-card"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => {
                setStatus(filter.value);
                resetVisibleCount();
              }}
              className={`min-h-9 shrink-0 rounded-full px-4 text-xs font-medium transition-colors ${
                status === filter.value
                  ? "bg-[#0b1b10] text-white dark:bg-primary dark:text-primary-foreground"
                  : "bg-white text-muted-foreground shadow-sm dark:bg-card"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="border-y border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No employers match this search.
        </p>
      ) : (
        <ul className="space-y-3">
          {visibleRows.map((row) => {
            const isExpanded = expandedId === row.company_id;
            const hasLiveRange = row.position_summaries.some((position) => position.range_visible);
            const reportsInMostReportedRole = Math.max(
              0,
              ...row.position_summaries.map((position) => position.contributions),
            );
            const canContribute = Boolean(
              user && eligibleCompanyIds.has(row.company_id) && !submittedCompanyIds.has(row.company_id),
            );
            const needsEligibility = Boolean(
              user && !eligibleCompanies.isPending && !eligibleCompanies.isError && !eligibleCompanyIds.has(row.company_id),
            );
            return (
              <li key={row.company_id} className="overflow-hidden rounded-[1.6rem] bg-white shadow-[0_5px_20px_rgba(10,25,15,.06)] dark:border dark:border-border dark:bg-card dark:shadow-none">
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : row.company_id)}
                  className="flex min-h-[96px] w-full items-start gap-3 px-4 py-4 text-left sm:px-5"
                >
                  <span className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#102015] ${avatarColor(row.name)}`}>
                    {row.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="truncate font-semibold">{row.name}</span>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${hasLiveRange ? "bg-lime-100 text-[#2e591a] dark:bg-primary/15 dark:text-primary" : row.contributions > 0 ? "bg-lime-100 text-[#3e591e] dark:bg-primary/10 dark:text-primary" : "bg-secondary text-muted-foreground"}`}>
                        {hasLiveRange ? <TrendingUp className="size-3" /> : row.contributions === 0 ? <LockKeyhole className="size-3" /> : <BarChart3 className="size-3" />}
                        {hasLiveRange ? "Ranges live" : row.contributions > 0 ? "Not enough data" : "No reports yet"}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {row.industry || "Industry not listed"} · <MapPin className="inline size-3" /> {row.county || "Kenya"}
                    </span>
                    <span className="mt-1.5 block text-xs text-muted-foreground">
                      {row.positions} position{row.positions === 1 ? "" : "s"} · {formatCount(row.contributions)} salary report{row.contributions === 1 ? "" : "s"}
                      {row.contributions > 0 && !hasLiveRange ? <strong className="font-semibold text-foreground"> · {Math.max(0, 3 - reportsInMostReportedRole)} more to unlock a range</strong> : null}
                    </span>
                  </span>
                  {isExpanded ? <ChevronUp className="mt-1 size-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />}
                </button>

                {isExpanded ? (
                  <div className="border-t border-border px-4 pb-4 pt-3 sm:px-5">
                    {row.position_summaries.length ? (
                      <div className="space-y-3">
                        {row.position_summaries.map((position) => (
                          <PositionRange key={position.role_title} position={position} />
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-2xl bg-secondary/60 px-3 py-4 text-sm text-muted-foreground">
                        No salary reports yet. Be the first eligible contributor.
                      </p>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Link
                        to="/companies/$slug"
                        params={{ slug: row.slug }}
                        className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-secondary px-3 text-center text-xs font-medium"
                      >
                        <Building2 className="size-4" /> Company profile
                      </Link>
                      {canContribute ? (
                        <button
                          type="button"
                          onClick={() => setActiveCompany(row)}
                          className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#0b1b10] px-3 text-xs font-medium text-white dark:bg-primary dark:text-primary-foreground"
                        >
                          <Wallet className="size-4" /> Add my salary
                        </button>
                      ) : user && submittedCompanyIds.has(row.company_id) ? (
                        <span className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-secondary px-3 text-center text-xs text-muted-foreground">
                          <Check className="size-4" /> Already submitted
                        </span>
                      ) : needsEligibility ? (
                        <span className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-secondary px-3 text-center text-[11px] text-muted-foreground">
                          Share workplace experience to contribute
                        </span>
                      ) : (
                        <Link
                          to={user ? "/profile" : "/auth"}
                          className="flex min-h-10 items-center justify-center gap-2 rounded-full bg-secondary px-3 text-center text-xs font-medium"
                        >
                          {user ? "Eligibility details" : "Sign in to contribute"}
                        </Link>
                      )}
                    </div>
                    {row.position_summaries.length ? (
                      <Link
                        to="/salaries/$slug"
                        params={{ slug: row.slug }}
                        className="mt-3 flex min-h-10 items-center justify-center gap-2 text-xs font-medium text-muted-foreground"
                      >
                        Full salary insight <ArrowUpRight className="size-4" />
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 ? (
        <div className="flex flex-col items-center gap-2 pt-2">
          <p className="text-xs text-muted-foreground">
            Showing {formatCount(visibleRows.length)} of {formatCount(rows.length)} employers
          </p>
          {rows.length > visibleRows.length ? (
            <Button variant="ghost" onClick={(event) => expandBy(20, event.currentTarget)}>
              Show more employers
            </Button>
          ) : null}
        </div>
      ) : null}

      <SalarySubmissionSheet
        company={activeCompany}
        open={Boolean(activeCompany)}
        onOpenChange={(open) => {
          if (!open) setActiveCompany(null);
        }}
        onSubmitted={async () => {
          setActiveCompany(null);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["salary-companies-v2"] }),
            queryClient.invalidateQueries({ queryKey: ["my-salary-companies", user?.uid] }),
          ]);
        }}
      />
    </div>
  );
}

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-3 backdrop-blur-sm">
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[10px] text-white/65">{label}</p>
    </div>
  );
}

function avatarColor(name: string) {
  const colors = ["bg-lime-300", "bg-cyan-400", "bg-orange-400", "bg-emerald-300", "bg-sky-300"];
  return colors[[...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length];
}

function PositionRange({ position }: { position: SalaryCompany["position_summaries"][number] }) {
  if (!position.range_visible || position.low_kes === null || position.high_kes === null) {
    return (
      <div className="rounded-2xl bg-[#f2f3ee] px-3 py-3 dark:bg-secondary/70">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-medium">{position.role_title}</span>
          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] text-muted-foreground dark:bg-background">
            {position.contributions} report{position.contributions === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <LockKeyhole className="size-3.5" /> Hidden until {Math.max(0, 3 - position.contributions)} more {Math.max(0, 3 - position.contributions) === 1 ? "report comes" : "reports come"} in.
        </p>
      </div>
    );
  }
  const average = position.average_kes ?? (position.low_kes + position.high_kes) / 2;
  const marker = position.high_kes === position.low_kes
    ? 50
    : Math.max(4, Math.min(96, ((average - position.low_kes) / (position.high_kes - position.low_kes)) * 100));
  return (
    <div className="rounded-2xl bg-[#f2f3ee] px-3 py-3 dark:bg-secondary/70">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium">{position.role_title}</span>
        <span className="shrink-0 rounded-full bg-lime-100 px-2 py-1 text-[10px] font-semibold text-[#31561c] dark:bg-primary/15 dark:text-primary">
          {position.contributions} reports
        </span>
      </div>
      <div className="relative mt-3 h-2.5 rounded-full bg-[#e5e8df] dark:bg-background">
        <span className="absolute inset-y-0 left-[20%] w-[60%] rounded-full bg-lime-300 dark:bg-primary/70" />
        <span className="absolute -top-0.5 h-3.5 w-1 -translate-x-1/2 rounded-full bg-[#152215] dark:bg-foreground" style={{ left: `${20 + marker * 0.6}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{kes(position.low_kes)}</span>
        <strong className="text-center text-foreground">Typical {kes(average)}</strong>
        <span>{kes(position.high_kes)}</span>
      </div>
    </div>
  );
}

function SalarySubmissionSheet({
  company,
  open,
  onOpenChange,
  onSubmitted,
}: {
  company: SalaryCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ role_title: "", min_kes: "", max_kes: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!company) return;
    setBusy(true);
    try {
      await submitSalary({
        data: {
          company_id: company.company_id,
          role_title: form.role_title,
          industry: company.industry,
          county: company.county,
          min_kes: Number(form.min_kes),
          max_kes: Number(form.max_kes),
        },
      });
      setForm({ role_title: "", min_kes: "", max_kes: "" });
      await onSubmitted();
      toast.success("Your salary range was submitted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit salary range.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[94dvh] rounded-t-[1.6rem] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <DrawerHeader className="px-0 text-left">
          <DrawerTitle className="font-display text-2xl">Add your salary range</DrawerTitle>
          <DrawerDescription>
            {company?.name} · Your identity is never attached to your report.
          </DrawerDescription>
        </DrawerHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4 overflow-y-auto pb-2">
          <div className="space-y-1.5">
            <Label htmlFor="salary-role">Position</Label>
            <Input
              id="salary-role"
              required
              minLength={2}
              maxLength={80}
              value={form.role_title}
              onChange={(event) => setForm({ ...form, role_title: event.target.value })}
              placeholder="e.g. Software developer"
              className="h-12 rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="salary-min">Minimum (KES)</Label>
              <Input
                id="salary-min"
                type="number"
                required
                min={0}
                max={10_000_000}
                value={form.min_kes}
                onChange={(event) => setForm({ ...form, min_kes: event.target.value })}
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="salary-max">Maximum (KES)</Label>
              <Input
                id="salary-max"
                type="number"
                required
                min={0}
                max={10_000_000}
                value={form.max_kes}
                onChange={(event) => setForm({ ...form, max_kes: event.target.value })}
                className="h-12 rounded-xl"
              />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Individual pay is never displayed. A role range appears only after at least three
            people have reported it.
          </p>
          <Button type="submit" disabled={busy || !company} className="h-12 w-full rounded-full">
            {busy ? "Submitting…" : "Submit salary range"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
