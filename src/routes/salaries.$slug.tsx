import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { getCompanySalaries } from "@/lib/public.functions";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/utils";
import { kes } from "@/routes/salaries.index";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";

const detailQuery = (slug: string) =>
  queryOptions({
    queryKey: ["salary-company", slug],
    queryFn: () => getCompanySalaries({ data: { slug } }),
  });

export const Route = createFileRoute("/salaries/$slug")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(detailQuery(params.slug));
    if (!data) throw notFound();
    return { name: data.company.name };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Employer not found | Candid" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.name} salaries by position | Candid`;
    const description = `Worker-reported pay ranges at ${loaderData.name}, broken down by position with contributor counts.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: CompanySalaryPage,
});

type SortKey = "role_title" | "average_kes" | "contributions";
const PAGE_SIZE = 10;

function CompanySalaryPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(detailQuery(slug));
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "contributions",
    dir: "desc",
  });
  const [page, setPage] = useState(0);

  const positions = useMemo(() => {
    const list = [...(data?.positions ?? [])];
    list.sort((a, b) => {
      const factor = sort.dir === "asc" ? 1 : -1;
      if (sort.key === "role_title") return a.role_title.localeCompare(b.role_title) * factor;
      const aValue = a[sort.key] ?? -1;
      const bValue = b[sort.key] ?? -1;
      return (aValue - bValue) * factor;
    });
    return list;
  }, [data, sort]);

  if (!data) return null;
  const pages = Math.max(1, Math.ceil(positions.length / PAGE_SIZE));
  const current = positions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const visibleRanges = positions.filter((position) => position.range_visible).length;

  function toggle(key: SortKey) {
    setPage(0);
    setSort((value) =>
      value.key === key
        ? { key, dir: value.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "role_title" ? "asc" : "desc" },
    );
  }

  function Header({ label, sortKey, right }: { label: string; sortKey: SortKey; right?: boolean }) {
    const active = sort.key === sortKey;
    return (
      <th className={`px-3 py-2.5 ${right ? "text-right" : "text-left"}`}>
        <button
          type="button"
          onClick={() => toggle(sortKey)}
          className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
        >
          {label}
          {active ? (
            sort.dir === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : null}
        </button>
      </th>
    );
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-clip bg-[#f5f6f1] pb-8 text-[#102015] dark:bg-background dark:text-foreground md:bg-transparent">
      <header className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(145deg,#142b17_0%,#09160d_72%)] px-5 py-5 text-white shadow-sm sm:px-7 sm:py-7">
        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-200">Salary insight</p>
          <h1 className="mt-2 flex flex-wrap items-center gap-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {data.company.name} salaries
            {data.company.verified ? <CompanyVerifiedBadge className="size-5" /> : null}
          </h1>
          <p className="mt-2 text-sm text-white/70">
            {data.company.industry ?? "—"} · {data.company.county ?? "—"}
          </p>
          <div className="mt-5 grid max-w-lg grid-cols-3 gap-2">
            <DetailStat value={formatCount(data.contributions)} label="Reports" />
            <DetailStat value={formatCount(visibleRanges)} label="Ranges live" />
            <DetailStat value={formatCount(positions.length)} label="Positions" />
          </div>
        </div>
        <span aria-hidden className="absolute -right-7 -top-8 size-36 rounded-full border-[20px] border-lime-300/10 sm:size-48" />
        <Link
          to="/companies/$slug"
          params={{ slug: data.company.slug }}
          className="relative z-10 mt-4 inline-flex min-h-10 items-center rounded-full bg-white/10 px-4 text-sm font-medium text-lime-100 transition hover:bg-white/15"
        >
          See stories and culture score →
        </Link>
      </header>

      <p className="rounded-2xl bg-white px-4 py-3 text-xs leading-5 text-muted-foreground shadow-sm dark:border dark:border-border dark:bg-card dark:shadow-none">
          These are member-reported figures in KES, grouped by role title. Reports don’t currently
          record experience level, gross/net status or pay period, so figures may not be directly
          comparable between people or employers.
      </p>

      <div className="min-w-0 overflow-x-auto rounded-[1.6rem] bg-white shadow-[0_5px_20px_rgba(10,25,15,.06)] dark:border dark:border-border dark:bg-card dark:shadow-none">
        <table className="w-full text-sm">
          <thead className="bg-[#eef0e9] text-[11px] text-muted-foreground dark:bg-secondary">
            <tr>
              <Header label="Position" sortKey="role_title" />
              <Header label="Average" sortKey="average_kes" />
              <th className="hidden px-3 py-2.5 text-left uppercase tracking-wide sm:table-cell">
                Typical range
              </th>
              <Header label="People" sortKey="contributions" right />
            </tr>
          </thead>
          <tbody>
            {current.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No salaries reported for this employer yet.
                </td>
              </tr>
            ) : (
              current.map((row) => (
                <tr key={row.role_title} className="border-t border-border/60">
                  <td className="max-w-[11rem] px-3 py-3 font-medium">
                    <span className="block truncate">{row.role_title}</span>
                    {!row.range_visible ? (
                      <span className="mt-1 block text-[10px] font-normal text-muted-foreground sm:hidden">
                        Needs {Math.max(0, data.minimum - row.contributions)} more report{data.minimum - row.contributions === 1 ? "" : "s"}
                      </span>
                    ) : row.low_kes !== null && row.high_kes !== null ? (
                      <span className="mt-1 block text-[10px] font-normal text-muted-foreground sm:hidden">
                        {kes(row.low_kes)}–{kes(row.high_kes)} typical
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-primary">
                    {row.range_visible && row.average_kes !== null ? kes(row.average_kes) : "—"}
                  </td>
                  <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">
                    {row.range_visible && row.low_kes !== null && row.high_kes !== null ? (
                      `${kes(row.low_kes)} – ${kes(row.high_kes)}`
                    ) : (
                      <span className="text-xs">
                        Needs {data.minimum - row.contributions} more contribution
                        {data.minimum - row.contributions === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-muted-foreground">
                    {formatCount(row.contributions)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          <Button variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DetailStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-3 backdrop-blur-sm">
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[10px] text-white/65">{label}</p>
    </div>
  );
}
