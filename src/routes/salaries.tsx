import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { notify as toast } from "@/lib/notifications-store";
import { Loader2, Wallet } from "lucide-react";
import { getSalaryAggregates } from "@/lib/public.functions";
import { submitSalary } from "@/lib/actions.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";

const salaryQuery = queryOptions({
  queryKey: ["salary-aggregates"],
  queryFn: () => getSalaryAggregates(),
});

export const Route = createFileRoute("/salaries")({
  loader: ({ context }) => context.queryClient.ensureQueryData(salaryQuery),
  head: () => ({
    meta: [
      { title: "Kenyan salary ranges by role and county | Candid" },
      {
        name: "description",
        content:
          "Anonymous salary ranges in KES shared by Kenyan workers, grouped by role, industry and county. Know the market rate before you negotiate.",
      },
      { property: "og:title", content: "Kenyan salary honesty — real KES ranges by role" },
      {
        property: "og:description",
        content:
          "Crowdsourced salary bands from Kenyan employees, shown only where enough people reported.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalariesPage,
});

const kes = (value: number) => `KES ${Math.round(value).toLocaleString("en-KE")}`;

function SalariesPage() {
  const { data } = useSuspenseQuery(salaryQuery);
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    role_title: "",
    industry: "",
    county: "",
    min_kes: "",
    max_kes: "",
  });

  const rows = useMemo(
    () =>
      data.rows.filter((row) =>
        q
          ? `${row.role_title ?? ""} ${row.industry ?? ""} ${row.county ?? ""}`
              .toLowerCase()
              .includes(q.toLowerCase())
          : true,
      ),
    [data.rows, q],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await submitSalary({
        data: {
          company_id: null,
          role_title: form.role_title,
          industry: form.industry || null,
          county: form.county || null,
          min_kes: Number(form.min_kes),
          max_kes: Number(form.max_kes),
        },
      });
      toast.success("Thanks — your range is in. It appears once two or more people report it.");
      setForm({ role_title: "", industry: "", county: "", min_kes: "", max_kes: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold md:text-4xl">Salary honesty</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Real KES ranges shared anonymously by Kenyan workers. A band only shows once at least two
          people have reported it, so no single person can be identified.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)] xl:grid-cols-[minmax(0,1.8fr)_minmax(340px,420px)]">
        <section className="space-y-4">
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search role, industry or county"
          />
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5 hidden sm:table-cell">County</th>
                  <th className="px-3 py-2.5">Typical range</th>
                  <th className="px-3 py-2.5 text-right">Reports</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      No ranges yet. Be the first to add one.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr key={index} className="border-t border-border/60">
                      <td className="px-3 py-3">
                        <div className="font-medium">{row.role_title}</div>
                        <div className="text-xs text-muted-foreground">{row.industry ?? "—"}</div>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell text-muted-foreground">
                        {row.county ?? "—"}
                      </td>
                      <td className="px-3 py-3 font-medium text-primary">
                        {kes(Number(row.low_kes ?? 0))} – {kes(Number(row.high_kes ?? 0))}
                        <div className="text-xs font-normal text-muted-foreground">
                          median {kes(Number(row.mid_kes ?? 0))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {Number(row.reports)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="glass-card h-fit rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 text-primary">
            <Wallet className="size-5" />
            <h2 className="font-display text-lg font-semibold">Add your range</h2>
          </div>
          {user ? (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="role">Role title</Label>
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
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    value={form.industry}
                    onChange={(event) => setForm({ ...form, industry: event.target.value })}
                    placeholder="Banking"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="county">County</Label>
                  <Input
                    id="county"
                    value={form.county}
                    onChange={(event) => setForm({ ...form, county: event.target.value })}
                    placeholder="Nairobi"
                  />
                </div>
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
      </div>
    </div>
  );
}
