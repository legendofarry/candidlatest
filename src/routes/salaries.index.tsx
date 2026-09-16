import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Building2, ChevronRight, Loader2, Wallet } from "lucide-react";
import { notify as toast } from "@/lib/notifications-store";
import { getFilterOptions, getSalaryCompanies } from "@/lib/public.functions";
import { submitSalary } from "@/lib/actions.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const salaryCompaniesQuery = queryOptions({
  queryKey: ["salary-companies"],
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
          "Browse Kenyan employers and see anonymous pay ranges broken down by position, with contributor counts for every role.",
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

function SalaryDirectory() {
  const { data } = useSuspenseQuery(salaryCompaniesQuery);
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      data.companies.filter((row) =>
        q
          ? `${row.name} ${row.industry ?? ""} ${row.county ?? ""}`
              .toLowerCase()
              .includes(q.toLowerCase())
          : true,
      ),
    [data.companies, q],
  );

  return (
    <div className="min-w-0 space-y-6 overflow-x-clip">
      <header>
        <h1 className="text-3xl font-semibold md:text-4xl">Salary honesty</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Pick an employer to see what people are actually paid, position by position. Typical
          ranges appear only once enough people have contributed, so nobody can be identified.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)] xl:grid-cols-[minmax(0,1.8fr)_minmax(340px,420px)]">
        <section className="space-y-3">
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search employer, industry or county"
          />
          {rows.length === 0 ? (
            <p className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">
              No salary contributions yet. Add the first one.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li key={row.company_id}>
                  <Link
                    to="/salaries/$slug"
                    params={{ slug: row.slug }}
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(0,6.5rem)] items-center gap-2 rounded-2xl border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:border-primary/50 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-3 sm:p-4"
                  >
                    <Building2 className="size-5 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.industry ?? "—"} · {row.county ?? "—"} · {row.positions} position
                        {row.positions === 1 ? "" : "s"} · {row.contributions} contribution
                        {row.contributions === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="min-w-0 text-right text-xs sm:text-sm">
                      <span className="block break-words font-medium leading-tight text-primary">
                        {row.average_kes === null ? "Not enough data" : kes(row.average_kes)}
                      </span>
                      {row.average_kes !== null ? (
                        <p className="text-[11px] text-muted-foreground">average</p>
                      ) : null}
                    </div>
                    <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ContributeCard />
      </div>
    </div>
  );
}

function ContributeCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [companyQuery, setCompanyQuery] = useState("");
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({ role_title: "", min_kes: "", max_kes: "" });

  const options = useQuery({
    queryKey: ["filter-options"],
    queryFn: () => getFilterOptions(),
    enabled: Boolean(user),
  });

  const matches = useMemo(() => {
    const list = options.data?.companies ?? [];
    const needle = companyQuery.trim().toLowerCase();
    return (needle ? list.filter((item) => item.name.toLowerCase().includes(needle)) : list).slice(
      0,
      8,
    );
  }, [options.data, companyQuery]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!company) {
      toast.error("Pick the employer from the list first.");
      return;
    }
    setBusy(true);
    try {
      const picked = options.data?.companies.find((item) => item.id === company.id);
      await submitSalary({
        data: {
          company_id: company.id,
          role_title: form.role_title,
          industry: picked?.industry ?? null,
          county: picked?.county ?? null,
          min_kes: Number(form.min_kes),
          max_kes: Number(form.max_kes),
        },
      });
      toast.success("Thanks — your range is in.");
      setForm({ role_title: "", min_kes: "", max_kes: "" });
      setCompany(null);
      setCompanyQuery("");
      await queryClient.invalidateQueries({ queryKey: ["salary-companies"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="glass-card h-fit rounded-2xl border border-border p-5">
      <div className="flex items-center gap-2 text-primary">
        <Wallet className="size-5" />
        <h2 className="font-display text-lg font-semibold">Add your range</h2>
      </div>
      {user ? (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="company">Employer</Label>
            {company ? (
              <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                <span className="flex-1 truncate">{company.name}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCompany(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="company"
                  value={companyQuery}
                  onChange={(event) => setCompanyQuery(event.target.value)}
                  placeholder="Start typing to find the employer"
                />
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {matches.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCompany({ id: item.id, name: item.name })}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-secondary",
                      )}
                    >
                      {item.name}
                    </button>
                  ))}
                  {matches.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      No match. Employers are added when someone posts a story about them.
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Position</Label>
            <Input
              id="role"
              required
              value={form.role_title}
              onChange={(event) => setForm({ ...form, role_title: event.target.value })}
              placeholder="e.g. Customer service agent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="min">Min (KES)</Label>
              <Input
                id="min"
                type="number"
                required
                min={0}
                value={form.min_kes}
                onChange={(event) => setForm({ ...form, min_kes: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max">Max (KES)</Label>
              <Input
                id="max"
                type="number"
                required
                min={0}
                value={form.max_kes}
                onChange={(event) => setForm({ ...form, max_kes: event.target.value })}
              />
            </div>
          </div>
          <Button type="submit" disabled={busy} className="w-full glow-primary">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Submit anonymously
          </Button>
        </form>
      ) : (
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <p>Sign in to add a salary range. Your identity is never attached to it.</p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/auth">Sign in to contribute</Link>
          </Button>
        </div>
      )}
    </aside>
  );
}
