import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties } from "react";
import { ArrowUpRight, Crosshair, Loader2, Radar, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanyWatchButton } from "@/components/site/company-watch-button";
import { getCompanySignal } from "@/components/site/company-hero";
import { useAuth } from "@/hooks/useAuth";
import { useWatchedCompanies } from "@/hooks/use-watched-companies";
import { listCompanyScores } from "@/lib/public.functions";
import { getCompanyAccent, getCompanyMonogram } from "@/lib/company-branding";
import { formatCount } from "@/lib/utils";

export const Route = createFileRoute("/companies/watched")({
  head: () => ({
    meta: [
      { title: "My Radar — tracked companies | Candid" },
      {
        name: "description",
        content: "Track Kenyan employers and get alerts when new workplace stories are published.",
      },
      { property: "og:title", content: "My Radar — tracked companies | Candid" },
      { property: "og:description", content: "Your personal watchlist of Kenyan employers on Candid." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WatchedCompaniesPage,
});

function WatchedCompaniesPage() {
  const { user } = useAuth();
  const watches = useWatchedCompanies();
  const scores = useQuery({ queryKey: ["company-scores"], queryFn: () => listCompanyScores(), enabled: Boolean(user) });
  const [q, setQ] = useState("");

  const scoreById = useMemo(
    () => new Map((scores.data?.companies ?? []).map((c) => [c.company_id, c])),
    [scores.data],
  );
  const list = (watches.data ?? []).filter((w) => w.company_name.toLowerCase().includes(q.trim().toLowerCase()));
  const rated = (watches.data ?? []).map((w) => Number(scoreById.get(w.company_id)?.overall ?? NaN)).filter((n) => !Number.isNaN(n));
  const avg = rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1) : "—";
  const totalStories = (watches.data ?? []).reduce((t, w) => t + Number(scoreById.get(w.company_id)?.story_count ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-5xl">
      <header className="relative isolate overflow-hidden border-b border-border/60 pb-6 pt-2">
        <div aria-hidden className="signal-grid pointer-events-none absolute inset-0 -z-10 opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <span className="relative inline-flex size-2">
            <span className="sonar-ping absolute inset-0 rounded-full bg-primary" />
            <span className="relative size-2 rounded-full bg-primary" />
          </span>
          My Radar
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">Tracked companies</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Get an alert the moment a new story about one of these employers goes live. Companies never see who tracks them.
        </p>

        {user && watches.data?.length ? (
          <>
            <dl className="mt-6 grid grid-cols-3 divide-x divide-border/60 border-y border-border/60">
              <Stat label="Tracked" value={String(watches.data.length)} />
              <Stat label="Stories" value={formatCount(totalStories)} />
              <Stat label="Avg score" value={avg} />
            </dl>
            <label className="mt-4 flex h-11 items-center gap-2 rounded-full border border-border/70 bg-background/60 px-4 focus-within:border-primary/60">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search your radar"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
          </>
        ) : null}
      </header>

      {!user ? (
        <Empty title="Sign in to build your radar" body="Track employers and hear about new stories first." cta={<Link to="/auth">Sign in</Link>} />
      ) : watches.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Scanning your radar…
        </div>
      ) : watches.isError ? (
        <section role="alert" className="py-12 text-center">
          <p className="text-sm text-danger">
            {watches.error instanceof Error ? watches.error.message : "Your radar could not be loaded."}
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => void watches.refetch()}>
            Try again
          </Button>
        </section>
      ) : watches.data?.length ? (
        <ul className="divide-y divide-border/60">
          {list.map((watch, index) => {
            const score = scoreById.get(watch.company_id) ?? null;
            const accent = getCompanyAccent(watch.company_name);
            const overall = score?.overall !== null && score?.overall !== undefined ? Number(score.overall) : null;
            const signal = getCompanySignal(score);
            const fresh = watch.last_notified_at && Date.now() - Date.parse(watch.last_notified_at) < 7 * 864e5;
            return (
              <li
                key={watch.company_id}
                className="hero-resolve group relative flex items-center gap-4 py-5"
                style={{ animationDelay: `${Math.min(index, 10) * 70}ms`, "--accent-brand": accent } as CSSProperties}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-4 w-1 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: accent }}
                />
                <Link
                  to="/companies/$slug"
                  params={{ slug: watch.company_slug }}
                  className="flex min-w-0 flex-1 items-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="relative shrink-0">
                    <span
                      className="grid size-12 place-items-center rounded-2xl font-display text-sm font-bold"
                      style={{
                        background: `linear-gradient(140deg, ${accent}, color-mix(in oklab, ${accent} 45%, black))`,
                        color: "oklch(0.99 0 0)",
                        boxShadow: `0 8px 24px -10px ${accent}`,
                      }}
                    >
                      {getCompanyMonogram(watch.company_name)}
                    </span>
                    <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-background">
                      <span className="relative inline-flex size-2">
                        {fresh ? <span className="sonar-ping absolute inset-0 rounded-full bg-primary" /> : null}
                        <span className={`relative size-2 rounded-full ${fresh ? "bg-primary" : "bg-muted-foreground/50"}`} />
                      </span>
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate font-semibold">
                      {watch.company_name}
                      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-xs ${signal.tone === "good" ? "text-verified" : signal.tone === "danger" ? "text-danger" : "text-muted-foreground"}`}
                    >
                      {signal.label}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {formatCount(score?.story_count ?? 0)} stories · tracking since{" "}
                      {new Date(watch.watched_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                    </span>
                  </span>
                  <span className={`hidden font-display text-xl font-bold tabular-nums sm:block ${overall === null ? "text-muted-foreground" : overall >= 3.5 ? "text-verified" : overall >= 2.5 ? "text-primary" : "text-danger"}`}>
                    {overall === null ? "—" : overall.toFixed(1)}
                  </span>
                </Link>
                <CompanyWatchButton
                  companyId={watch.company_id}
                  companySlug={watch.company_slug}
                  companyName={watch.company_name}
                  variant="compact"
                />
              </li>
            );
          })}
          {list.length === 0 ? <li className="py-10 text-center text-sm text-muted-foreground">No tracked company matches “{q}”.</li> : null}
        </ul>
      ) : (
        <Empty
          title="Your radar is empty"
          body="Open any employer and tap “Track company” to hear about new stories."
          cta={<Link to="/companies">Browse companies</Link>}
        />
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3 first:pl-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Empty({ title, body, cta }: { title: string; body: string; cta: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center py-16 text-center">
      <div className="relative grid size-20 place-items-center">
        <span className="sonar-ping absolute inset-2 rounded-full border border-primary/50" />
        <span className="absolute inset-0 rounded-full border border-border" />
        <span className="absolute inset-4 rounded-full border border-border/60" />
        <Radar className="size-7 text-primary" />
      </div>
      <h2 className="mt-5 font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      <Button asChild className="mt-5 rounded-full">
        {cta}
      </Button>
      <Crosshair className="hidden" />
    </section>
  );
}
