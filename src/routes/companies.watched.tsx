import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanyWatchButton } from "@/components/site/company-watch-button";
import { useAuth } from "@/hooks/useAuth";
import { getMyCompanyWatches } from "@/lib/company-watch.functions";

export const Route = createFileRoute("/companies/watched")({
  head: () => ({
    meta: [
      { title: "Watched companies | Candid" },
      {
        name: "description",
        content:
          "Manage the employers you watch and get alerts when new workplace stories are published.",
      },
    ],
  }),
  component: WatchedCompaniesPage,
});

function WatchedCompaniesPage() {
  const { user } = useAuth();
  const fetchWatches = useServerFn(getMyCompanyWatches);
  const watches = useQuery({
    queryKey: ["company-watches", user?.uid ?? null],
    queryFn: () => fetchWatches(),
    enabled: Boolean(user),
  });

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6">
      <header className="border-b border-border/70 pb-5">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <Bell className="size-4" /> Company Watch
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Watched companies
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Get an in-app notification when a new story about a watched employer is published.
          Watching doesn’t give a company access to your account or change its community stories.
        </p>
      </header>

      {!user ? (
        <section className="border-y border-border py-12 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Sign in to manage your watchlist</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Watch employers from their directory pages and keep up with new stories.
          </p>
          <Button asChild className="mt-5">
            <Link to="/auth">Sign in</Link>
          </Button>
        </section>
      ) : watches.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your watchlist…
        </div>
      ) : watches.isError ? (
        <section role="alert" className="border-y border-destructive/30 py-8 text-center">
          <p className="text-sm text-destructive">
            {watches.error instanceof Error
              ? watches.error.message
              : "Your watchlist could not be loaded."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void watches.refetch()}
          >
            Try again
          </Button>
        </section>
      ) : watches.data?.length ? (
        <ul className="divide-y divide-border/70">
          {watches.data.map((watch) => (
            <li
              key={watch.company_id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <Link
                to="/companies/$slug"
                params={{ slug: watch.company_slug }}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{watch.company_name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Watching since {new Date(watch.watched_at).toLocaleDateString()}
                  </span>
                </span>
              </Link>
              <CompanyWatchButton
                companyId={watch.company_id}
                companySlug={watch.company_slug}
                companyName={watch.company_name}
              />
            </li>
          ))}
        </ul>
      ) : (
        <section className="border-y border-border py-12 text-center">
          <Bell className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">No companies watched yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Visit an employer’s page and choose “Watch company” to hear about new stories.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/companies/">Browse the directory</Link>
          </Button>
        </section>
      )}
    </main>
  );
}
