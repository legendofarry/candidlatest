import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CircleHelp,
  Flame,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { listCompanyScores } from "@/lib/public.functions";
import {
  getMyCompanyAccountApplicationAction,
  submitCompanyAccountApplicationAction,
} from "@/lib/company-groups.functions";
import { notify as toast } from "@/lib/notifications-store";

export const Route = createFileRoute("/company/setup")({
  head: () => ({ meta: [{ title: "Company workspace | Candid" }] }),
  component: CompanySetupPage,
});

const applicationQuery = (userId: string | undefined) => ({
  queryKey: ["my-company-account-application", userId ?? null],
  queryFn: () => getMyCompanyAccountApplicationAction(),
  enabled: Boolean(userId),
});

function CompanySetupPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const getState = useServerFn(getOnboardingState);
  const submitApplication = useServerFn(submitCompanyAccountApplicationAction);
  const getApplication = useServerFn(getMyCompanyAccountApplicationAction);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [website, setWebsite] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [confirmAuthority, setConfirmAuthority] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [welcomeCelebration, setWelcomeCelebration] = useState(false);

  const state = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => getState(),
    enabled: Boolean(user),
  });
  const companies = useQuery({
    queryKey: ["company-scores"],
    queryFn: () => listCompanyScores(),
    staleTime: 60_000,
  });
  const application = useQuery({ ...applicationQuery(user?.uid), queryFn: () => getApplication() });
  const companyRows = useMemo(
    () => (companies.data?.companies ?? []).filter((company) => company.company_id && company.name && company.slug),
    [companies.data?.companies],
  );
  const filteredCompanies = companyRows
    .filter((company) => company.name.toLocaleLowerCase().includes(companySearch.trim().toLocaleLowerCase()))
    .slice(0, 12);
  const selectedCompany = companyRows.find((company) => company.company_id === selectedCompanyId);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (state.data && state.data.accountType !== "company") void navigate({ to: "/profile" });
  }, [state.data, navigate]);

  useEffect(() => {
    if (!application.isFetched || !application.data || application.data.status !== "approved") return;
    setCelebrate(true);
  }, [application.data, application.isFetched]);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem("candid:company-account-created") !== "1") return;
      window.sessionStorage.removeItem("candid:company-account-created");
      setWelcomeCelebration(true);
    } catch {
      // The workspace remains usable when session storage is unavailable.
    }
  }, [user?.uid]);

  async function requestCompanyAccess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedCompanyId || !confirmAuthority) {
      setError("Choose the company page and confirm that you’re authorized to represent it.");
      return;
    }
    setSubmitting(true);
    try {
      await user?.getIdToken(true);
      await submitApplication({
        data: {
          company_id: selectedCompanyId,
          role_title: roleTitle,
          website,
          registration_number: registrationNumber,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["my-company-account-application"] });
      toast.success("Company page request sent", { description: "Candid will review the details." });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not send your request.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user || state.isLoading) {
    return <div className="flex min-h-[70dvh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Setting up your company workspace…</div>;
  }

  const status = application.data?.status;

  return (
    <main className="min-h-dvh bg-background text-foreground lg:grid lg:min-h-dvh lg:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.22fr)]">
      <section className="relative isolate flex min-h-[34dvh] flex-col justify-between overflow-hidden border-b border-border bg-[radial-gradient(ellipse_at_12%_0%,rgba(34,197,94,.21),transparent_46%),linear-gradient(145deg,#101c1a,#0b0c10_72%)] px-5 py-6 sm:px-8 sm:py-9 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r lg:px-12 lg:py-10 xl:px-16">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <motion.div animate={reduceMotion ? undefined : { rotate: 360 }} transition={reduceMotion ? undefined : { duration: 60, repeat: Infinity, ease: "linear" }} className="absolute -right-24 top-14 size-72 rounded-full border border-lime-300/10" />
          <motion.div animate={reduceMotion ? undefined : { y: [0, -12, 0] }} transition={reduceMotion ? undefined : { duration: 6, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-10 right-[16%] flex size-24 items-center justify-center rounded-[2rem] border border-lime-200/15 bg-lime-200/[0.04] text-lime-200 shadow-[0_0_90px_-30px_rgba(190,242,100,.25)]">
            <Building2 className="size-10 stroke-[1.25]" />
          </motion.div>
          <span className="absolute right-[21%] top-[28%] size-2 rounded-full bg-lime-200 shadow-[0_0_22px_6px_rgba(190,242,100,.28)]" />
        </div>
        <div className="relative z-10 flex items-center gap-2 font-display text-lg font-semibold"><Flame className="size-6 text-primary" />Candid<span className="text-primary">.</span></div>
        <div className="relative z-10 max-w-xl py-8 lg:py-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Company workspace</p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl xl:text-6xl">Show up as the company, <span className="text-primary">with proof.</span></h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/55 sm:text-lg sm:leading-8">Your company account can explore public workplace stories. Claiming an official page is reviewed by Candid, and official contributions require a verified company account with Premium.</p>
        </div>
        <div className="relative z-10 hidden gap-3 text-xs text-white/45 sm:flex">
          <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-200" />Independent worker stories stay independent</span>
        </div>
      </section>

      <section className="min-w-0 px-5 pb-12 pt-5 sm:px-8 sm:pt-7 lg:h-dvh lg:overflow-y-auto lg:px-12 lg:pb-14 lg:pt-10 xl:px-16">
        <div className="mx-auto w-full max-w-3xl">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" />Back to Candid</Link>
          <header className="mt-8 border-b border-border pb-7 sm:mt-10 sm:pb-9">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Sparkles className="size-4" />Your account is ready</div>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Claim a company page</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">Select the existing Candid company page you represent. We’ll check the public website, your verified email domain, and your role before enabling official tools.</p>
          </header>

          {celebrate || welcomeCelebration ? (
            <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
              {Array.from({ length: 22 }, (_, index) => (
                <motion.span key={index} initial={{ opacity: 0, y: -24, rotate: 0 }} animate={{ opacity: [0, 1, 1, 0], y: [0, 180 + (index % 5) * 38], x: [(index % 2 ? -1 : 1) * ((index * 31) % 270), (index % 2 ? -1 : 1) * ((index * 53) % 380)], rotate: 300 + index * 35 }} transition={{ duration: 2.2 + (index % 5) * 0.22, delay: (index % 8) * 0.08, ease: "easeOut" }} style={{ left: `${(index * 47) % 100}%` }} className={`absolute top-0 h-3 w-2 ${index % 3 === 0 ? "bg-primary" : index % 3 === 1 ? "bg-emerald-300" : "bg-amber-200"}`} />
              ))}
            </div>
          ) : null}

          {welcomeCelebration ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 px-6 text-center backdrop-blur-md">
              <div className="max-w-xl">
                <motion.span initial={{ scale: 0.6, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 230, damping: 15 }} className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary"><Building2 className="size-9" /></motion.span>
                <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Welcome to Candid</p>
                <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-6xl">Your company account is ready.</h2>
                <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted-foreground">You can explore Candid now, then request access to the company page you represent. Free company accounts can read; Premium unlocks contributions.</p>
                <Button onClick={() => setWelcomeCelebration(false)} className="mt-7 h-12 rounded-full px-7">Continue to workspace <ArrowRight className="size-4" /></Button>
              </div>
            </motion.div>
          ) : null}

          {status === "approved" ? (
            <section className="py-10 sm:py-14">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300"><BadgeCheck className="size-7" /></span>
              <h3 className="mt-5 font-display text-2xl font-semibold">Company page verified</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Your organization can now publish clearly labeled official updates when its account has Premium. Worker stories remain controlled by their authors and Candid’s community rules.</p>
              <Button asChild className="mt-6 h-12 rounded-full px-6"><Link to="/companies/$slug" params={{ slug: application.data.company_slug }}>Open company page <ArrowRight className="size-4" /></Link></Button>
            </section>
          ) : status === "pending_review" ? (
            <section className="py-10 sm:py-14">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-200"><ShieldCheck className="size-7" /></span>
              <h3 className="mt-5 font-display text-2xl font-semibold">Request sent for review</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Your company account is active and can read public Candid pages. The selected company page remains unclaimed until Candid completes its review.</p>
              <p className="mt-5 text-sm font-medium">{application.data.company_name} · {application.data.role_title}</p>
              <Button asChild variant="outline" className="mt-6 h-11 rounded-full px-5"><Link to="/">Continue to Candid <ArrowRight className="size-4" /></Link></Button>
            </section>
          ) : (
            <form onSubmit={requestCompanyAccess} className="space-y-6 py-7 sm:space-y-8 sm:py-9">
              {status === "declined" && application.data?.review_note ? <p role="alert" className="border-l-2 border-amber-300 px-4 py-2 text-sm text-amber-100">Previous request: {application.data.review_note}</p> : null}
              <div className="space-y-3">
                <Label htmlFor="company-search" className="text-sm font-semibold">Company page</Label>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="company-search" value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} placeholder="Search the company directory" className="h-12 rounded-full pl-11" />
                </label>
                <div className="divide-y divide-border border-y border-border">
                  {filteredCompanies.map((company) => (
                    <button key={company.company_id} type="button" aria-pressed={selectedCompanyId === company.company_id} onClick={() => setSelectedCompanyId(company.company_id!)} className={`flex min-h-14 w-full items-center gap-3 px-2 text-left transition-colors hover:bg-secondary/50 ${selectedCompanyId === company.company_id ? "text-foreground" : "text-muted-foreground"}`}>
                      <span className={`flex size-9 items-center justify-center rounded-xl ${selectedCompanyId === company.company_id ? "bg-primary/15 text-primary" : "bg-secondary"}`}><Building2 className="size-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{company.name}</span><span className="block truncate text-xs text-muted-foreground">{company.industry ?? "Company"} · #{company.slug}</span></span>
                      {selectedCompanyId === company.company_id ? <Check className="size-4 text-primary" /> : null}
                    </button>
                  ))}
                  {!filteredCompanies.length ? <p className="py-5 text-sm text-muted-foreground">No listed company matches that search.</p> : null}
                </div>
                {selectedCompany ? <p className="text-xs text-muted-foreground">Category: {selectedCompany.industry ?? "Not yet categorized"}. Categories are managed in the company directory.</p> : null}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="role-title">Your role</Label>
                  <Input id="role-title" value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} maxLength={120} placeholder="e.g. People & Culture lead" className="h-12 rounded-xl" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-website">Official company website</Label>
                  <Input id="company-website" type="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://company.co.ke" className="h-12 rounded-xl" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="registration-number">Business registration number <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="registration-number" value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} maxLength={80} placeholder="Company registration number" className="h-12 rounded-xl" />
              </div>

              <div className="flex items-start gap-3 border-y border-border py-4">
                <input id="authority-check" type="checkbox" checked={confirmAuthority} onChange={(event) => setConfirmAuthority(event.target.checked)} className="mt-1 size-4 accent-primary" />
                <Label htmlFor="authority-check" className="cursor-pointer text-sm leading-6 text-muted-foreground">I’m authorized to represent this organization, and I understand the company page can’t edit or remove independent worker stories.</Label>
              </div>
              <div className="flex items-start gap-3 text-xs leading-5 text-muted-foreground"><CircleHelp className="mt-0.5 size-4 shrink-0" />Your verified sign-in email domain is included in the review. Don’t upload ID cards, payslips, or personal documents here.</div>
              {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="submit" disabled={submitting || !selectedCompanyId} className="h-12 w-full rounded-full text-base sm:w-auto sm:min-w-56 sm:text-sm">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : null}{submitting ? "Sending for review…" : "Request company verification"}{!submitting ? <ArrowRight className="size-4" /> : null}
                </Button>
                <Button type="button" variant="ghost" onClick={() => void navigate({ to: "/" })} className="h-11 rounded-full">I’ll do this later</Button>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

