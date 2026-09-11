import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { getCompany } from "@/lib/public.functions";
import { StoryCard } from "@/components/site/story-card";
import { ScoreBadge } from "@/routes/companies.index";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const companyQuery = (slug: string) =>
  queryOptions({
    queryKey: ["company", slug],
    queryFn: () => getCompany({ data: { slug } }),
  });

export const Route = createFileRoute("/companies/$slug")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(companyQuery(params.slug));
    if (!data) throw notFound();
    return { name: data.company.name, descriptor: data.profile?.descriptor ?? null };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Company not found | Candid" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.name} — employee exit stories & culture score | Candid`;
    const description =
      loaderData.descriptor ??
      `Anonymous exit stories, red-flag scores and salary ranges reported for ${loaderData.name} in Kenya.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: CompanyPage,
});

const METRICS = [
  ["pay_on_time", "Pay on time"],
  ["compliance", "Contracts & statutory (NSSF/SHIF/PAYE)"],
  ["respect", "Respect"],
  ["workload", "Workload"],
  ["growth", "Growth"],
] as const;

function CompanyPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(companyQuery(slug));
  if (!data) return null;
  const { company, score, profile, stories } = data;

  return (
    <div className="space-y-8">
      <section className="mesh-hero animate-fade rounded-3xl border border-border p-6 md:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold md:text-4xl">{company.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {company.industry} · {company.county}
              {company.verified ? " · verified employer" : ""}
            </p>
            {profile?.descriptor ? <p className="mt-3 max-w-4xl">{profile.descriptor}</p> : null}
          </div>
          <div className="text-right">
            <ScoreBadge value={score?.overall ?? null} />
            <p className="mt-2 text-xs text-muted-foreground">
              {Number(score?.story_count ?? 0)} stories · {Number(score?.rating_count ?? 0)} ratings
            </p>
            {score?.would_work_again_pct !== null && score?.would_work_again_pct !== undefined ? (
              <p className="text-xs text-verified">
                {Math.round(Number(score.would_work_again_pct))}% would work here again
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <h2 className="text-xl font-semibold">Exit stories</h2>
          {stories.length === 0 ? (
            <p className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">
              No published stories for this employer yet.{" "}
              <Link to="/post" className="text-primary">
                Be the first to share one.
              </Link>
            </p>
          ) : (
            stories.map((story, index) => <StoryCard key={story.id} story={story} index={index} />)
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Red-flag breakdown</h2>
            <div className="mt-4 space-y-3">
              {METRICS.map(([key, label]) => {
                const value = score ? Number(score[key] ?? 0) : 0;
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{label}</span>
                      <span>{value ? value.toFixed(1) : "—"}</span>
                    </div>
                    <Progress value={(value / 5) * 100} className="mt-1 h-1.5" />
                  </div>
                );
              })}
            </div>
          </div>

          {profile ? (
            <div className="rounded-2xl border border-verified/30 bg-verified/5 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-verified" /> AI-researched — unverified
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">{profile.summary}</p>
              <dl className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                {profile.headquarters ? (
                  <div>
                    <dt className="inline font-medium text-foreground">Headquarters: </dt>
                    <dd className="inline">{profile.headquarters}</dd>
                  </div>
                ) : null}
                {profile.size_band ? (
                  <div>
                    <dt className="inline font-medium text-foreground">Size: </dt>
                    <dd className="inline">{profile.size_band}</dd>
                  </div>
                ) : null}
                {profile.founded_year ? (
                  <div>
                    <dt className="inline font-medium text-foreground">Founded: </dt>
                    <dd className="inline">{profile.founded_year}</dd>
                  </div>
                ) : null}
              </dl>
              {profile.typical_roles?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profile.typical_roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {role}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {profile.employment_context ? (
                <p className="mt-3 text-xs text-muted-foreground">{profile.employment_context}</p>
              ) : null}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Generated {new Date(profile.generated_at).toLocaleDateString("en-KE")} · background
                only, not a claim about this employer.
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-card p-5 text-sm">
            <h2 className="font-semibold">Right of reply</h2>
            <p className="mt-2 text-muted-foreground">
              Employers can request a verified response to any story on this page.
            </p>
            <Link to="/about" className="mt-2 inline-block text-primary">
              How to reply →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
