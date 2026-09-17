import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  FileUp,
  Lock,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { inbox, notify as toast } from "@/lib/notifications-store";
import { getFilterOptions } from "@/lib/public.functions";
import { createStory, ensureProfile, findOrCreateCompany } from "@/lib/actions.functions";
import { findCompanyMatches } from "@/lib/company-match";
import { useAuth } from "@/hooks/useAuth";
import { firebaseStorage } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/site/confirm-dialog";
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

type EvidenceFile = { file: File; path: string };

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
  const [customReason, setCustomReason] = useState("");
  const [tenure, setTenure] = useState("");
  const [roleLevel, setRoleLevel] = useState("");
  const [position, setPosition] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty =
    companyName.trim().length > 0 ||
    reasons.length > 0 ||
    title.trim().length > 0 ||
    body.trim().length > 0;

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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

  const matches = findCompanyMatches(companyName, filters.companies, 5);
  const exactMatch = matches.some((m) => m.name.toLowerCase() === companyName.trim().toLowerCase());

  function addCustomReason(raw: string) {
    const value = raw.replace(/,+$/, "").trim();
    if (value.length < 2) return;
    if (reasons.some((r) => r.toLowerCase() === value.toLowerCase())) {
      setCustomReason("");
      return;
    }
    if (reasons.length >= 10) return;
    setReasons((current) => [...current, value]);
    setCustomReason("");
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    const next = [...evidenceFiles];
    for (const file of Array.from(list)) {
      if (next.length >= 5) break;
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 8MB`);
        continue;
      }
      next.push({ file, path: "" });
    }
    setEvidenceFiles(next);
  }

  async function submit() {
    setSubmitting(true);
    try {
      await ensure({ data: { county: county || null } });
      const company = await findCompany({
        data: { name: companyName.trim(), industry: industry || null, county: county || null },
      });

      let evidence: { note: string | null; files: { path: string; name: string }[] } | null = null;
      if (evidenceFiles.length > 0 || evidenceNote.trim()) {
        const draftId = crypto.randomUUID();
        const uploaded: { path: string; name: string }[] = [];
        for (const item of evidenceFiles) {
          const path = `evidence/${user!.uid}/${draftId}/${item.file.name}`;
          await uploadBytes(storageRef(firebaseStorage, path), item.file);
          uploaded.push({ path, name: item.file.name });
        }
        evidence = { note: evidenceNote.trim() || null, files: uploaded };
      }

      const result = await create({
        data: {
          company_id: company.id,
          title: title.trim(),
          body: body.trim(),
          reasons,
          role_level: roleLevel || null,
          position: position.trim() || null,
          county: county || null,
          tenure: tenure || null,
          industry: industry || company.industry || null,
          would_work_again: wouldReturn,
          evidence,
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
                <Label htmlFor="company">Who was your employer?</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="e.g. Sky Minimart, Naivas, a boda stage"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  The shop, company, or person you worked for — whatever name everyone knows it by.
                </p>

                {matches.length > 0 && !exactMatch ? (
                  <div className="space-y-1.5 rounded-2xl border border-border bg-secondary/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {matches.length === 1
                        ? "Possible existing employer — is this the same business?"
                        : "Possible existing employers — is one of these the same business?"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {matches.map((match) => (
                        <button
                          key={match.slug}
                          type="button"
                          onClick={() => setCompanyName(match.name)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/50"
                        >
                          <Building2 className="size-3.5 text-primary" />
                          {match.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {companyName.trim().length > 1 && matches.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    Can't find your employer? No problem — posting adds "
                    <span className="font-medium text-foreground">{companyName.trim()}</span>" to
                    the directory so others can find it too.
                  </p>
                ) : null}
              </div>
              <ChipField
                label="What kind of work do they do? (industry)"
                options={filters.industries}
                value={industry}
                onChange={setIndustry}
              />
              <ChipField
                label="Which county is this?"
                options={filters.counties}
                value={county}
                onChange={setCounty}
              />
            </>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Why did you leave? Pick all that apply</Label>
                <div className="flex flex-wrap gap-1.5">
                  {REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
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

              <div className="space-y-2">
                <Label htmlFor="custom-reason">Or type your own</Label>
                <Input
                  id="custom-reason"
                  value={customReason}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.endsWith(",")) {
                      addCustomReason(value);
                    } else {
                      setCustomReason(value);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomReason(customReason);
                    }
                  }}
                  placeholder="Type a reason, then press Enter or comma"
                />
                <p className="text-xs text-muted-foreground">
                  Each comma or Enter saves it as its own reason.
                </p>
                {reasons.filter((r) => !(REASONS as readonly string[]).includes(r)).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {reasons
                      .filter((r) => !(REASONS as readonly string[]).includes(r))
                      .map((reason) => (
                        <span
                          key={reason}
                          className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1.5 text-sm"
                        >
                          {reason}
                          <button
                            type="button"
                            aria-label={`Remove ${reason}`}
                            onClick={() =>
                              setReasons((current) => current.filter((item) => item !== reason))
                            }
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="position">What was your job title there?</Label>
                <Input
                  id="position"
                  value={position}
                  onChange={(event) => setPosition(event.target.value)}
                  placeholder="e.g. Cashier, Graphic Designer, Accountant, Rider"
                />
                <p className="text-xs text-muted-foreground">
                  Different positions are paid and treated differently — this keeps your story (and
                  salary data) accurate.
                </p>
              </div>
              <ChipField label="How long did you work there?" options={TENURES} value={tenure} onChange={setTenure} />
              <ChipField
                label="How senior were you?"
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
                      type="button"
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
            <div className="space-y-4 text-sm">
              <h2 className="text-lg font-semibold">Before you publish</h2>
              <ul className="space-y-2 text-muted-foreground">
                <li>· Your story publishes under an anonymous handle. Your email is never shown.</li>
                <li>· Do not name individual colleagues, managers or clients.</li>
                <li>· Stick to what you experienced or can describe factually.</li>
                <li>· An automated screen checks every story before it goes live.</li>
              </ul>

              <div className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Lock className="size-4 text-primary" /> Prove you worked there (optional,
                  private)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Attach anything that shows you worked there — staff ID, contract or exit letter,
                  work email, or an M-Pesa statement/screenshot of salary payments. It is{" "}
                  <span className="font-medium text-foreground">never published</span> and never
                  shown to the employer — only moderators review it.
                </p>
                <p className="text-xs text-muted-foreground">
                  Paid via M-Pesa from your boss's personal number? That's normal for small
                  businesses — just add a short note below telling us.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    onPickFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={evidenceFiles.length >= 5}
                >
                  <FileUp className="size-4" /> Attach evidence ({evidenceFiles.length}/5)
                </Button>
                {evidenceFiles.length > 0 ? (
                  <ul className="space-y-1">
                    {evidenceFiles.map((item, index) => (
                      <li
                        key={`${item.file.name}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs"
                      >
                        <span className="truncate">{item.file.name}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${item.file.name}`}
                          onClick={() =>
                            setEvidenceFiles((current) =>
                              current.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Textarea
                  rows={2}
                  value={evidenceNote}
                  onChange={(event) => setEvidenceNote(event.target.value)}
                  placeholder="Optional note, e.g. “Salary came from the owner's personal M-Pesa, name Peter K.”"
                />
              </div>

              <Button className="w-full glow-primary" disabled={submitting} onClick={submit}>
                {submitting ? "Screening and publishing…" : "Publish anonymously"}
              </Button>
            </div>
          ) : null}

          <div className="flex justify-between pt-2">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {dirty && !submitting ? (
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() => setDiscardOpen(true)}
              >
                <Trash2 className="size-4" /> Discard
              </Button>
            ) : null}
            {step < 4 ? (
              <Button disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
                Continue <ArrowRight className="size-4" />
              </Button>
            ) : null}
          </div>

          <ConfirmDialog
            open={discardOpen}
            onOpenChange={setDiscardOpen}
            title="Discard this story?"
            description="Everything you've written here will be lost. This cannot be undone."
            confirmLabel="Discard draft"
            destructive
            onConfirm={() => navigate({ to: "/" })}
          />
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
            type="button"
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
        placeholder={`Or type it yourself`}
      />
    </div>
  );
}
