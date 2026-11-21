import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  Briefcase,
  ChevronRight,
  FileText,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { getCompany, listCompanyScores } from "@/lib/public.functions";
import { StoryCard } from "@/components/site/story-card";
import { CompanyHero } from "@/components/site/company-hero";
import { CompanyLogo } from "@/components/site/company-logo";
import { CompanyWatchButton } from "@/components/site/company-watch-button";
import { CompanyRatingDialog } from "@/components/site/company-rating-dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CompanyIntelPanel } from "@/components/site/company-intel";
import { useAuth } from "@/hooks/useAuth";
import { formatCount } from "@/lib/utils";

const companyQuery = (slug: string) =>
  queryOptions({
    queryKey: ["company", slug],
    queryFn: () => getCompany({ data: { slug } }),
  });

const companyDirectoryQuery = queryOptions({
  queryKey: ["company-scores"],
  queryFn: () => listCompanyScores(),
  staleTime: 60_000,
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
      `Workplace stories, red-flag scores and salary ranges reported for ${loaderData.name} in Kenya.`;
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
  notFoundComponent: CompanyNotFound,
  errorComponent: CompanyLoadError,
});

function CompanyNotFound() {
  return (
    <CompanyMessage
      title="Company not found"
      message="This company page may have moved or may not be public yet."
    />
  );
}

function CompanyLoadError({ reset }: { reset: () => void }) {
  return (
    <CompanyMessage
      title="Company page unavailable"
      message="We couldn’t load this company’s information. Try again, or return to the company directory."
      retry={reset}
    />
  );
}

function CompanyMessage({
  title,
  message,
  retry,
}: {
  title: string;
  message: string;
  retry?: (() => void) | undefined;
}) {
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card px-6 py-10 text-center sm:py-14">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex justify-center gap-3">
        {retry ? (
          <button
            type="button"
            onClick={retry}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
        ) : null}
        <Link
          to="/companies"
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium"
        >
          Browse companies
        </Link>
      </div>
    </section>
  );
}

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
  const { data: directoryData } = useQuery(companyDirectoryQuery);
  const { user } = useAuth();
  const [ratingOpen, setRatingOpen] = useState(false);
  if (!data) return null;
  const { company, score, profile, stories } = data;
  const overall = toScore(score?.overall);
  const storyCount = Number(score?.story_count ?? stories.length);
  const ratingCount = Number(score?.rating_count ?? 0);
  const canRate = Boolean(user?.emailVerified);
  const rateDestination = !user ? "/auth" : "/verify-email";
  const comparableCompanies = (directoryData?.companies ?? [])
    .filter(
      (
        candidate,
      ): candidate is typeof candidate & { company_id: string; name: string; slug: string } =>
        Boolean(candidate.company_id && candidate.slug && candidate.name) &&
        candidate.company_id !== company.id,
    )
    .sort((a, b) => {
      const sameIndustry =
        Number(b.industry === company.industry) - Number(a.industry === company.industry);
      return sameIndustry || Number(b.story_count ?? 0) - Number(a.story_count ?? 0);
    })
    .slice(0, 3);

  return (
    <>
      <CompanyContextSidebar
        company={company}
        overall={overall}
        storyCount={storyCount}
        ratingCount={ratingCount}
      />

      <div className="space-y-8">
        <div id="company-overview" className="scroll-mt-28">
          <CompanyHero
            company={company}
            score={score}
            descriptor={profile?.descriptor ?? null}
            stories={stories}
            actionsInSidebar
          />
        </div>

        <Link
          to="/company-groups/$slug"
          params={{ slug: company.slug }}
          className="group flex min-h-16 items-center gap-3 border-y border-primary/20 bg-primary/[0.04] px-4 py-3 transition-colors hover:bg-primary/[0.08] sm:px-5"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Open #{company.slug} community</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Join members, read discussions, and follow workplace stories</span>
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>

        <nav
          aria-label={`${company.name} profile sections`}
          className="sticky top-16 z-20 -mx-1 flex items-center gap-1 overflow-x-auto border-y border-border/70 bg-background/90 px-2 py-2 backdrop-blur-md md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {[
            ["company-overview", "Overview"],
            ["company-stories", "Exit stories"],
            ["company-ratings", "Ratings & insights"],
            ["company-scores", "Pay & compliance"],
            ["company-open-roles", "Open roles"],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="shrink-0 rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden grid-cols-2 gap-2 md:grid lg:hidden">
          {!canRate ? (
            <Link
              to={rateDestination}
              className="flex h-11 items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold"
            >
              <Star className="size-4" /> Rate
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setRatingOpen(true)}
              className="flex h-11 items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold"
            >
              <Star className="size-4" /> Rate
            </button>
          )}
          <Link
            to="/post"
            className="flex h-11 items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold"
          >
            <ArrowUpRight className="size-4" /> Share a story
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-8">
            <section id="company-stories" className="scroll-mt-28">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                    Candid community
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-semibold">Exit stories</h2>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
                  {formatCount(storyCount)} {storyCount === 1 ? "story" : "stories"}
                </span>
              </div>
              {stories.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/30 px-6 py-10 text-center">
                  <FileText className="size-8 text-muted-foreground/70" />
                  <p className="mt-4 max-w-md text-muted-foreground">
                    No published stories for this employer yet.
                  </p>
                  <Link
                    to="/post"
                    className="mt-4 rounded-full border border-primary/40 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                  >
                    Be the first to share one
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {stories.map((story, index) => (
                    <StoryCard key={story.id} story={story} index={index} />
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
              <section id="company-ratings" className="scroll-mt-28">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 className="font-display text-xl font-semibold">Ratings &amp; insights</h2>
                  <span className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
                    {formatCount(ratingCount)}
                  </span>
                </div>
                {company.id.startsWith("seed-") ? (
                  <div className="flex min-h-40 items-center rounded-3xl border border-border bg-card/40 p-6 text-sm leading-6 text-muted-foreground">
                    Member ratings and workplace insights will appear here as people share their
                    experiences.
                  </div>
                ) : (
                  <CompanyIntelPanel
                    companyId={company.id}
                    companyName={company.name}
                    metooTotal={stories.reduce(
                      (total, story) => total + Number(story.metoo ?? 0),
                      0,
                    )}
                  />
                )}
              </section>

              <section
                id="company-scores"
                className="scroll-mt-28 rounded-3xl border border-border bg-card p-6"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                  Workplace metrics
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold">Pay &amp; compliance</h2>
                <div className="mt-5 space-y-4">
                  {METRICS.map(([key, label]) => {
                    const value = score ? Number(score[key] ?? 0) : 0;
                    return (
                      <div key={key}>
                        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                          <span>{label}</span>
                          <span>{value ? value.toFixed(1) : "—"}</span>
                        </div>
                        <Progress value={(value / 5) * 100} className="mt-1.5 h-1.5" />
                      </div>
                    );
                  })}
                </div>
              </section>

              <section
                id="company-salaries"
                className="scroll-mt-28 rounded-3xl border border-border bg-card/40 p-6"
              >
                <Banknote className="size-5 text-primary" />
                <h2 className="mt-3 font-display text-xl font-semibold">Salary insights</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  See worker-reported pay ranges for roles at {company.name}.
                </p>
                {company.id.startsWith("seed-") ? (
                  <Link
                    to="/salaries"
                    className="mt-5 inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    Browse salaries
                  </Link>
                ) : (
                  <Link
                    to="/salaries/$slug"
                    params={{ slug: company.slug }}
                    className="mt-5 inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    View salaries
                  </Link>
                )}
              </section>

              <section
                id="company-open-roles"
                className="scroll-mt-28 rounded-3xl border border-border bg-card/40 p-6"
              >
                <Briefcase className="size-5 text-primary" />
                <h2 className="mt-3 font-display text-xl font-semibold">Open roles</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Openings shared for this employer will appear here.
                </p>
                <span className="mt-5 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                  Not listed yet
                </span>
              </section>

              {profile ? (
                <section className="rounded-3xl border border-verified/30 bg-verified/5 p-6">
                  <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
                    <Sparkles className="size-4 text-verified" /> About this employer
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{profile.summary}</p>
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
                    <p className="mt-3 text-xs text-muted-foreground">
                      {profile.employment_context}
                    </p>
                  ) : null}
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Generated {new Date(profile.generated_at).toLocaleDateString("en-KE")} ·
                    background only, not a claim about this employer.
                  </p>
                </section>
              ) : null}

              <section className="rounded-3xl border border-border bg-card/40 p-6 text-sm">
                <ShieldCheck className="size-5 text-primary" />
                <h2 className="mt-3 font-display text-xl font-semibold">Right of reply</h2>
                <p className="mt-2 leading-6 text-muted-foreground">
                  Employers can request a verified response to any story on this page.
                </p>
                <Link to="/about" className="mt-4 inline-block font-medium text-primary">
                  How to reply →
                </Link>
              </section>
            </div>
          </div>

          <aside className="hidden space-y-5 lg:sticky lg:top-20 lg:block lg:self-start">
            <CompanyActionCard
              company={company}
              overall={overall}
              ratingCount={ratingCount}
              rateHref={!canRate ? rateDestination : null}
              onRate={() => setRatingOpen(true)}
            />
            <CompanyCompareCard companies={comparableCompanies} currentCompanyId={company.id} />
          </aside>
        </div>
      </div>

      {canRate ? (
        <CompanyRatingDialog
          open={ratingOpen}
          onOpenChange={setRatingOpen}
          companyId={company.id}
          companyName={company.name}
        />
      ) : null}
    </>
  );
}

function toScore(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function CompanyActionCard({
  company,
  overall,
  ratingCount,
  rateHref,
  onRate,
}: {
  company: { id: string; name: string; slug: string };
  overall: number | null;
  ratingCount: number;
  rateHref: "/auth" | "/verify-email" | null;
  onRate: () => void;
}) {
  const ratingsNeeded = Math.max(0, 5 - ratingCount);
  const scoreMessage =
    overall === null
      ? `Needs ${ratingsNeeded} ${ratingsNeeded === 1 ? "rating" : "ratings"} to score`
      : `Based on ${formatCount(ratingCount)} ${ratingCount === 1 ? "rating" : "ratings"}`;

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col items-center border-b border-border/70 pb-5 text-center">
        <MiniScoreRing value={overall} large />
        <p className="mt-3 text-sm text-muted-foreground">{scoreMessage}</p>
      </div>
      <div className="mt-5 space-y-2.5">
        <CompanyWatchButton
          companyId={company.id}
          companySlug={company.slug}
          companyName={company.name}
          variant="sidebar"
        />
        {rateHref ? (
          <Link
            to={rateHref}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Star className="size-4" /> Rate
          </Link>
        ) : (
          <button
            type="button"
            onClick={onRate}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Star className="size-4" /> Rate
          </button>
        )}
        <Link
          to="/post"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <ArrowUpRight className="size-4" /> Share a story
        </Link>
      </div>
    </section>
  );
}

function CompanyCompareCard({
  companies,
  currentCompanyId,
}: {
  companies: Array<{
    company_id: string;
    name: string;
    slug: string;
    industry?: string | null | undefined;
  }>;
  currentCompanyId: string;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold">Compare with</h2>
        <Scale className="size-4 text-muted-foreground" />
      </div>
      {companies.length ? (
        <div className="mt-3 space-y-1">
          {companies.map((company) => (
            <Link
              key={company.company_id}
              to="/compare"
              search={{ companyId: company.company_id, compareWith: currentCompanyId }}
              className="group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-secondary/70"
            >
              <CompanyLogo name={company.name} sizeClassName="size-10 rounded-full" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold group-hover:text-primary">
                  {company.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {company.industry ?? "Employer"}
                </span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Similar employers will appear here as the directory grows.
        </p>
      )}
      <Link
        to="/compare"
        className="mt-3 flex items-center justify-center gap-1 rounded-full py-2 text-sm font-semibold text-primary transition-colors hover:text-foreground"
      >
        See all <ChevronRight className="size-4" />
      </Link>
    </section>
  );
}

function CompanyContextSidebar({
  company,
  overall,
  storyCount,
  ratingCount,
}: {
  company: {
    id: string;
    name: string;
    slug: string;
    industry?: string | null | undefined;
    county?: string | null | undefined;
  };
  overall: number | null;
  storyCount: number;
  ratingCount: number;
}) {
  const [activeSection, setActiveSection] = useState("company-overview");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = [
      "company-overview",
      "company-stories",
      "company-ratings",
      "company-scores",
      "company-open-roles",
    ]
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const navItems = [
    { id: "company-overview", label: "Overview", icon: Sparkles },
    { id: "company-stories", label: "Exit stories", icon: FileText, count: storyCount },
    { id: "company-ratings", label: "Ratings & insights", icon: Star, count: ratingCount },
    { id: "company-scores", label: "Pay & compliance", icon: ShieldCheck },
    { id: "company-open-roles", label: "Open roles", icon: Briefcase },
  ];

  return (
    <aside className="fixed bottom-0 left-0 top-0 z-40 hidden w-72 flex-col border-r border-border bg-background/95 px-4 pb-4 pt-5 backdrop-blur-xl md:flex">
      <Link
        to="/companies"
        className="inline-flex w-fit items-center gap-2 px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All companies
      </Link>

      <div className="mt-5 rounded-3xl border border-border bg-card/70 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyLogo name={company.name} sizeClassName="size-12 rounded-full" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-semibold">{company.name}</h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {company.industry ?? "Industry not listed"} · {company.county ?? "Kenya"}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-4">
          <MiniScoreRing value={overall} />
          <div className="space-y-1 text-right text-sm text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">{formatCount(ratingCount)}</span>{" "}
              ratings
            </p>
            <p>
              <span className="font-semibold text-foreground">{formatCount(storyCount)}</span>{" "}
              stories
            </p>
          </div>
        </div>
      </div>

      <nav
        className="mt-7 min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Company navigation"
      >
        <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          On this page
        </p>
        <div className="space-y-1">
          {navItems.slice(0, 3).map((item) => (
            <CompanySectionLink key={item.id} item={item} active={activeSection === item.id} />
          ))}
          {company.id.startsWith("seed-") ? (
            <Link
              to="/salaries"
              className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Banknote className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Salaries</span>
            </Link>
          ) : (
            <Link
              to="/salaries/$slug"
              params={{ slug: company.slug }}
              className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Banknote className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Salaries</span>
            </Link>
          )}
          {navItems.slice(3).map((item) => (
            <CompanySectionLink key={item.id} item={item} active={activeSection === item.id} />
          ))}
        </div>
      </nav>
    </aside>
  );
}

function CompanySectionLink({
  item,
  active,
}: {
  item: { id: string; label: string; icon: LucideIcon; count?: number };
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <a
      href={`#${item.id}`}
      aria-current={active ? "location" : undefined}
      className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <Icon className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count !== undefined ? (
        <span className="min-w-7 rounded-full bg-secondary px-2 py-0.5 text-center text-xs tabular-nums text-muted-foreground">
          {formatCount(item.count)}
        </span>
      ) : null}
    </a>
  );
}

function MiniScoreRing({ value, large = false }: { value: number | null; large?: boolean }) {
  const progress = value === null ? 0 : Math.min(100, Math.max(0, (value / 5) * 100));
  return (
    <div
      role="img"
      aria-label={value === null ? "No score yet" : `Culture score ${value.toFixed(1)} out of 5`}
      className={`grid place-items-center rounded-full p-[5px] ${large ? "size-36" : "size-[4.5rem]"}`}
      style={{
        background: `conic-gradient(var(--primary) ${progress}%, var(--border) 0)`,
      }}
    >
      <div className="grid size-full place-items-center rounded-full bg-card text-center">
        <div>
          <p
            className={`font-display font-bold leading-none tabular-nums ${large ? "text-3xl" : "text-lg"}`}
          >
            {value === null ? "—" : value.toFixed(1)}
          </p>
          <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">of 5</p>
        </div>
      </div>
    </div>
  );
}
