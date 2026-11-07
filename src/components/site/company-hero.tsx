import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Banknote, MessageSquareText, Scale, Sparkles, TrendingDown, TrendingUp, Users } from "lucide-react";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { CompanyWatchButton } from "@/components/site/company-watch-button";
import {
  getCompanyAccent,
  getCompanyBrand,
  getCompanyBrandLogoUrl,
  getCompanyMonogram,
} from "@/lib/company-branding";
import { getCompanyBrandInfo } from "@/lib/company.functions";
import { formatCount } from "@/lib/utils";

type Score = {
  overall?: number | string | null;
  pay_on_time?: number | string | null;
  compliance?: number | string | null;
  story_count?: number | null;
  rating_count?: number | null;
  would_work_again_pct?: number | string | null;
} | null;

type Props = {
  company: { id: string; name: string; slug: string; industry?: string | null; county?: string | null; verified?: boolean };
  score: Score | undefined;
  descriptor: string | null | undefined;
  stories: Array<{ created_at?: string | null }>;
};

const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));

/** Turns the raw averages into one plain-language headline about the employer. */
export function getCompanySignal(score: Score | undefined) {
  const overall = num(score?.overall);
  const pay = num(score?.pay_on_time);
  const again = num(score?.would_work_again_pct);
  if (!score || overall === null) return { tone: "neutral" as const, label: "Building a picture — few ratings yet" };
  if (pay !== null && pay < 2.5) return { tone: "danger" as const, label: "Late or missed pay reported" };
  if (again !== null && again >= 70) return { tone: "good" as const, label: `${Math.round(again)}% would work here again` };
  if (pay !== null && pay >= 4) return { tone: "good" as const, label: "Pays on time, people say" };
  if (overall >= 3.5) return { tone: "good" as const, label: "Rated well by former staff" };
  if (overall < 2.5) return { tone: "danger" as const, label: "Many red flags reported" };
  return { tone: "neutral" as const, label: "Mixed experiences reported" };
}

export function CompanyHero({ company, score, descriptor, stories }: Props) {
  const fetchBrand = useServerFn(getCompanyBrandInfo);
  const discovered = useQuery({
    queryKey: ["company-brand", company.id],
    queryFn: () => fetchBrand({ data: { company_id: company.id } }),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  }).data;
  const brand = getCompanyBrand(company.name);
  const accent = discovered?.color ?? getCompanyAccent(company.name);
  const logoUrl = discovered?.logoUrl ?? (brand ? getCompanyBrandLogoUrl(brand.domain) : null);
  const fallbackLogoUrl = discovered?.domain ? getCompanyBrandLogoUrl(discovered.domain) : null;
  const overall = num(score?.overall);
  const signal = getCompanySignal(score);
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = stories.filter((s) => s.created_at && Date.parse(s.created_at) > monthAgo).length;
  const status = company.verified ? "verified" : recent > 0 ? "active" : "quiet";
  const pay = num(score?.pay_on_time);
  const compliance = num(score?.compliance);

  const vars = { "--accent-brand": accent } as CSSProperties;

  return (
    <section
      style={vars}
      className="hero-resolve relative isolate overflow-hidden border-y border-border/60 px-4 py-8 max-sm:ml-[calc(50%-50vw)] max-sm:w-screen sm:rounded-3xl sm:border sm:px-8 md:py-10"
    >
      {/* Living brand aura */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-background" />
      <div
        aria-hidden
        className="aura-breathe pointer-events-none absolute -left-1/4 -top-1/2 -z-10 size-[42rem] rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, color-mix(in oklab, ${accent} 45%, transparent), transparent 65%)` }}
      />
      <div
        aria-hidden
        className="aura-drift pointer-events-none absolute -bottom-1/2 right-[-20%] -z-10 size-[30rem] rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, color-mix(in oklab, ${accent} 22%, transparent), transparent 70%)` }}
      />
      <div aria-hidden className="signal-grid pointer-events-none absolute inset-0 -z-10 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 sm:rounded-3xl"
        style={{ boxShadow: `inset 0 1px 0 color-mix(in oklab, ${accent} 50%, transparent), inset 0 0 0 1px color-mix(in oklab, ${accent} 18%, transparent)` }}
      />
      {/* one-time scan line */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-1/3 overflow-hidden">
        <div
          className="hud-scan h-full w-full"
          style={{ background: `linear-gradient(90deg, transparent, color-mix(in oklab, ${accent} 16%, transparent), transparent)` }}
        />
      </div>

      <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <BrandMark name={company.name} logoUrl={logoUrl} fallbackLogoUrl={fallbackLogoUrl} accent={accent} status={status} />
            <div className="min-w-0 pt-1">
              <SignalCapsule tone={signal.tone} label={signal.label} />
              <h1 className="mt-2 flex flex-wrap items-center gap-2 font-display text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
                {company.name}
                {company.verified ? <CompanyVerifiedBadge className="size-6" /> : null}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {[company.industry, company.county].filter(Boolean).join(" · ")}
                <span className="ml-2 inline-flex items-center gap-1.5 align-middle text-xs">
                  <StatusDot status={status} />
                  {status === "verified" ? "Official account" : status === "active" ? `${recent} new this month` : "Quiet lately"}
                </span>
              </p>
            </div>
          </div>

          {descriptor ? (
            <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-foreground/85">{descriptor}</p>
          ) : null}

          <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
            <Vital icon={Banknote} label="Pay on time" value={pay !== null ? `${pay.toFixed(1)}/5` : "—"} trend={pay} delay={0} />
            <Vital icon={Scale} label="NSSF · SHIF · PAYE" value={compliance !== null ? `${compliance.toFixed(1)}/5` : "—"} trend={compliance} delay={80} />
            <Vital icon={MessageSquareText} label="Stories" value={formatCount(score?.story_count ?? stories.length)} delay={160} />
            <Vital icon={Users} label="Ratings" value={formatCount(score?.rating_count)} delay={240} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-5 md:flex-col md:items-end">
          <ScoreRing value={overall} accent={accent} />
          <CompanyWatchButton companyId={company.id} companySlug={company.slug} companyName={company.name} variant="hero" />
        </div>
      </div>
    </section>
  );
}

function BrandMark({ name, logoUrl, fallbackLogoUrl, accent, status }: { name: string; logoUrl: string | null; fallbackLogoUrl: string | null; accent: string; status: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [logoUrl, fallbackLogoUrl].find((url) => url && !failed.includes(url)) ?? null;
  return (
    <div className="relative shrink-0">
      <div
        aria-hidden
        className="aura-breathe absolute -inset-3 rounded-[1.75rem] blur-xl"
        style={{ background: `color-mix(in oklab, ${accent} 40%, transparent)` }}
      />
      <div
        aria-hidden="true"
        className="relative grid size-[4.5rem] place-items-center overflow-hidden rounded-[1.4rem] border border-border/60 md:size-20"
        style={
          src
            ? { background: "oklch(0.99 0 0)" }
            : { background: `linear-gradient(140deg, ${accent}, color-mix(in oklab, ${accent} 45%, black))` }
        }
      >
        {src ? (
          <img src={src} alt="" className="size-[70%] object-contain" onError={() => setFailed((list) => [...list, src])} />
        ) : (
          <span className="font-display text-2xl font-bold tracking-tight" style={{ color: "oklch(0.99 0 0)" }}>
            {getCompanyMonogram(name)}
          </span>
        )}
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[1.4rem] bg-gradient-to-b from-foreground/10 to-transparent mix-blend-overlay" />
      </div>
      <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-background">
        <StatusDot status={status} />
      </span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "verified" ? "bg-verified" : status === "active" ? "bg-primary" : "bg-muted-foreground/50";
  return (
    <span className="relative inline-flex size-2.5">
      {status !== "quiet" ? <span className={`sonar-ping absolute inset-0 rounded-full ${color}`} /> : null}
      <span className={`relative size-2.5 rounded-full ${color}`} />
    </span>
  );
}

function SignalCapsule({ tone, label }: { tone: "good" | "danger" | "neutral"; label: string }) {
  const cls =
    tone === "good"
      ? "border-verified/30 bg-verified/10 text-verified"
      : tone === "danger"
        ? "border-danger/30 bg-danger/10 text-danger"
        : "border-border bg-secondary/60 text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${cls}`}>
      {tone === "good" ? <BadgeCheck className="size-3.5" /> : tone === "danger" ? <TrendingDown className="size-3.5" /> : <Sparkles className="size-3.5" />}
      {label}
    </span>
  );
}

function Vital({
  icon: Icon,
  label,
  value,
  trend,
  delay,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
  trend?: number | null;
  delay: number;
}) {
  return (
    <div
      className="animate-rise flex shrink-0 items-center gap-2.5 rounded-2xl border border-border/60 bg-background/50 px-3 py-2 backdrop-blur-md"
      style={{ animationDelay: `${300 + delay}ms` }}
    >
      <Icon className="size-4 text-muted-foreground" />
      <div className="leading-tight">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="flex items-center gap-1 text-sm font-semibold tabular-nums">
          {value}
          {trend !== undefined && trend !== null ? (
            trend >= 3.5 ? (
              <TrendingUp className="size-3.5 text-verified" />
            ) : trend < 2.5 ? (
              <TrendingDown className="size-3.5 text-danger" />
            ) : null
          ) : null}
        </p>
      </div>
    </div>
  );
}

function ScoreRing({ value, accent }: { value: number | null; accent: string }) {
  const r = 34;
  const length = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value / 5));
  const tone = value === null ? "text-muted-foreground" : value >= 3.5 ? "text-verified" : value >= 2.5 ? "text-primary" : "text-danger";
  return (
    <div className="relative grid size-24 place-items-center md:size-28" aria-label={value === null ? "No score yet" : `Culture score ${value.toFixed(1)} out of 5`}>
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="5" className="stroke-border/60" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          className={`ring-draw ${tone}`}
          stroke="currentColor"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - pct)}
          style={{ "--ring-length": `${length}`, filter: `drop-shadow(0 0 6px color-mix(in oklab, ${accent} 60%, transparent))` } as CSSProperties}
        />
      </svg>
      <div className="text-center leading-none">
        <p className={`font-display text-2xl font-bold tabular-nums md:text-3xl ${tone}`}>{value === null ? "—" : value.toFixed(1)}</p>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">of 5</p>
      </div>
    </div>
  );
}
