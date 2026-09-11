import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { inbox, notify as toast } from "@/lib/notifications-store";
import { getFilterOptions } from "@/lib/public.functions";
import { createStory, ensureProfile, findOrCreateCompany } from "@/lib/actions.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const filtersQuery = queryOptions({ queryKey: ["filters"], queryFn: () => getFilterOptions() });

const REASONS = [
  "delayed salary",
  "unpaid overtime",
  "harassment",
  "tribalism / nepotism",
  "no contract",
  "wrongful dismissal",
  "no statutory deductions",
  "toxic management",
  "good exit",
] as const;

const TENURES = ["Under 6 months", "6–12 months", "1–2 years", "3–5 years", "5+ years"];
const LEVELS = ["Intern", "Entry level", "Mid level", "Senior", "Management"];

export const Route = createFileRoute("/post")({
  loader: ({ context }) => context.queryClient.ensureQueryData(filtersQuery),
  head: () => ({
    meta: [
      { title: "Share your exit story anonymously | Candid" },
      {
        name: "description",
        content:
          "Tell Kenyan job seekers why you really left. Four quick steps, fully anonymous, screened before publishing.",
      },
      { property: "og:title", content: "Share your exit story anonymously" },
      {
        property: "og:description",
        content: "Anonymous, screened, and attached to the employer — help the next person decide.",
      },
    ],
  }),
  component: PostPage,
});

function PostPage() {
  const { data: filters } = useSuspenseQuery(filtersQuery);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const ensure = useServerFn(ensureProfile);
  const findCompany = useServerFn(findOrCreateCompany);
  const create = useServerFn(createStory);

  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [county, setCounty] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [tenure, setTenure] = useState("");
  const [roleLevel, setRoleLevel] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-8 text-center">
        <ShieldCheck className="mx-auto size-8 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold">Sign in to post anonymously</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We ask for an account only to stop spam and abuse. Your story always shows as an anonymous
          handle — your email and name are never displayed or shared.
        </p>
        <Button asChild className="mt-5">
          <Link to="/auth">Sign in or create an account</Link>
        </Button>
      </div>
    );
  }

  const steps = ["Employer", "What happened", "Your role", "Your story", "Anonymity"];

  async function submit() {
    setSubmitting(true);
    try {
      await ensure({ data: { county: county || null } });
      const company = await findCompany({
        data: { name: companyName.trim(), industry: industry || null, county: county || null },
      });
      const result = await create({
        data: {
          company_id: company.id,
          title: title.trim(),
          body: body.trim(),
          reasons: reasons as (typeof REASONS)[number][],
          role_level: roleLevel || null,
          county: county || null,
          tenure: tenure || null,
          industry: industry || company.industry || null,
          would_work_again: wouldReturn,
        },
      });

      if (!result.ok) {
        toast.error(`We could not publish this: ${result.message}`);
        return;
      }
      if (result.status === "published") {
        toast.success("Your story is live");
        navigate({ to: "/stories/$id", params: { id: result.id } });
      } else {
        inbox.info("Story submitted for review", {
          description: "It will appear in the feed once a moderator approves it.",
        });
        navigate({ to: "/" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const canContinue = [
    companyName.trim().length > 1,
    reasons.length > 0,
    true,
    title.trim().length >= 8 && body.trim().length >= 60,
    true,
  ][step];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold md:text-4xl">Share your exit story</h1>
        <div className="mt-4 flex gap-1.5">
          {steps.map((label, index) => (
            <div
              key={label}
              className={cn(
                "h-1.5 flex-1 rounded-full bg-secondary transition-colors",
                index <= step && "bg-primary",
              )}
            />
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Step {step + 1} of {steps.length} · {steps[step]}
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        <div className="space-y-5 rounded-3xl border border-border bg-card p-6">
          {step === 0 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="company">Employer name</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="e.g. Sokoni Bank Kenya"
                  list="company-list"
                />
                <datalist id="company-list">
                  {filters.companies.map((company) => (
                    <option key={company.slug} value={company.name} />
                  ))}
                </datalist>
              </div>
              <ChipField
                label="Industry"
                options={filters.industries}
                value={industry}
                onChange={setIndustry}
              />
              <ChipField
                label="County"
                options={filters.counties}
                value={county}
                onChange={setCounty}
              />
            </>
          ) : null}

          {step === 1 ? (
            <div className="space-y-2">
              <Label>Why did you leave? Pick all that apply</Label>
              <div className="flex flex-wrap gap-1.5">
                {REASONS.map((reason) => (
                  <button
                    key={reason}
                    onClick={() =>
                      setReasons((current) =>
                        current.includes(reason)
                          ? current.filter((item) => item !== reason)
                          : [...current, reason],
                      )
                    }
                    className={cn(
                      "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground",
                      reasons.includes(reason) && "border-primary/50 bg-primary/10 text-foreground",
                    )}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <>
              <ChipField label="Tenure" options={TENURES} value={tenure} onChange={setTenure} />
              <ChipField
                label="Role level"
                options={LEVELS}
                value={roleLevel}
                onChange={setRoleLevel}
              />
              <div className="space-y-2">
                <Label>Would you work here again?</Label>
                <div className="flex gap-2">
                  {[
                    { label: "Yes", value: true },
                    { label: "No", value: false },
                  ].map((option) => (
                    <button
                      key={option.label}
                      onClick={() => setWouldReturn(option.value)}
                      className={cn(
                        "rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground",
                        wouldReturn === option.value &&
                          "border-primary/50 bg-primary/10 text-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="title">Headline</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Three months of salary paid late, every time"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="body">Your story</Label>
                <Textarea
                  id="body"
                  rows={10}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="What happened, how it affected you, and what a job seeker should know. Describe roles, not names."
                />
                <p className="text-xs text-muted-foreground">
                  {body.trim().length} characters (min 60)
                </p>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3 text-sm">
              <h2 className="text-lg font-semibold">Before you publish</h2>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  · Your story publishes under an anonymous handle. Your email is never shown.
                </li>
                <li>· Do not name individual colleagues, managers or clients.</li>
                <li>· Stick to what you experienced or can describe factually.</li>
                <li>· An automated screen checks every story before it goes live.</li>
              </ul>
              <Button className="w-full glow-primary" disabled={submitting} onClick={submit}>
                {submitting ? "Screening and publishing…" : "Publish anonymously"}
              </Button>
            </div>
          ) : null}

          <div className="flex justify-between pt-2">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {step < 4 ? (
              <Button disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
                Continue <ArrowRight className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4 rounded-3xl border border-danger/30 bg-danger/5 p-5 text-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-danger" /> Keep yourself safe
          </h2>
          <p className="text-muted-foreground">
            Never include names of individuals, phone numbers, contract numbers, or details only you
            and one manager would know.
          </p>
          <p className="text-muted-foreground">
            Kenyan defamation law protects individuals. Describe conduct and roles, not people.
          </p>
          <Link to="/guidelines" className="inline-block font-medium text-danger">
            Read the full guidelines →
          </Link>
        </aside>
      </div>
    </div>
  );
}

function ChipField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(value === option ? "" : option)}
            className={cn(
              "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground",
              value === option && "border-primary/50 bg-primary/10 text-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Or type a ${label.toLowerCase()}`}
      />
    </div>
  );
}
