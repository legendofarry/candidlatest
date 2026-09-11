import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, FileText, Search as SearchIcon } from "lucide-react";
import { searchAll } from "@/lib/public.functions";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search Kenyan employers and exit stories | Candid" },
      {
        name: "description",
        content:
          "Search Candid for an employer or a specific exit story. Find out how a Kenyan company treats staff before your interview.",
      },
      { property: "og:title", content: "Search Kenyan employers and exit stories" },
      {
        property: "og:description",
        content: "One search box across every company profile and anonymous exit story on Candid.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");
  const trimmed = q.trim();

  const { data, isFetching } = useQuery({
    queryKey: ["search", trimmed],
    queryFn: () => searchAll({ data: { q: trimmed } }),
    enabled: trimmed.length >= 2,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold md:text-4xl">Search</h1>
        <p className="mt-2 text-muted-foreground">
          Look up an employer or a story. Try a company name, a role, or a phrase like "delayed
          salary".
        </p>
      </header>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search companies and stories"
          className="h-12 pl-9 text-base"
        />
      </div>

      {trimmed.length < 2 ? (
        <p className="text-sm text-muted-foreground">Type at least two characters to search.</p>
      ) : isFetching && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Building2 className="size-4" /> Companies
            </h2>
            <div className="mt-3 space-y-1">
              {(data?.companies ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No employers matched.</p>
              ) : (
                data!.companies.map((company) => (
                  <Link
                    key={company.slug}
                    to="/companies/$slug"
                    params={{ slug: company.slug ?? "" }}
                    className="block rounded-xl border border-border px-4 py-3 transition-colors hover:bg-secondary"
                  >
                    <div className="font-medium">{company.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[company.industry, company.county].filter(Boolean).join(" · ") || "Kenya"}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <FileText className="size-4" /> Stories
            </h2>
            <div className="mt-3 space-y-1">
              {(data?.stories ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No stories matched.</p>
              ) : (
                data!.stories.map((story) => (
                  <Link
                    key={story.id}
                    to="/stories/$id"
                    params={{ id: story.id ?? "" }}
                    className="block rounded-xl border border-border px-4 py-3 transition-colors hover:bg-secondary"
                  >
                    <div className="font-medium">{story.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {[story.company_name, story.county].filter(Boolean).join(" · ")}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
