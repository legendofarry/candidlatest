import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { getCompanySalaries } from "@/lib/public.functions";
import { Button } from "@/components/ui/button";
import { kes } from "@/routes/salaries.index";

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
    const description = `Anonymous pay ranges reported at ${loaderData.name}, broken down by position with contributor counts.`;
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
      return (a[sort.key] - b[sort.key]) * factor;
    });
    return list;
  }, [data, sort]);

  if (!data) return null;
  const pages = Math.max(1, Math.ceil(positions.length / PAGE_SIZE));
  const current = positions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

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
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold md:text-4xl">{data.company.name} salaries</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {data.company.industry ?? "—"} · {data.company.county ?? "—"} · {data.contributions}{" "}
          contribution{data.contributions === 1 ? "" : "s"}
        </p>
        <Link
          to="/companies/$slug"
          params={{ slug: data.company.slug }}
          className="mt-2 inline-block text-sm text-primary"
        >
          See stories and culture score →
        </Link>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs text-muted-foreground">
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
                  <td className="px-3 py-3 font-medium">{row.role_title}</td>
                  <td className="px-3 py-3 text-primary">
                    {row.range_visible ? kes(row.average_kes) : "—"}
                  </td>
                  <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">
                    {row.range_visible ? (
                      `${kes(row.low_kes)} – ${kes(row.high_kes)}`
                    ) : (
                      <span className="text-xs">
                        Needs {data.minimum - row.contributions} more contribution
                        {data.minimum - row.contributions === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-muted-foreground">
                    {row.contributions}
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
