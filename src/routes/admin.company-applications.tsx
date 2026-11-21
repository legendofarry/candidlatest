import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, BadgeCheck, Building2, Check, Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  listCompanyAccountApplicationsAction,
  reviewCompanyAccountApplicationAction,
} from "@/lib/company-groups.functions";
import { notify as toast } from "@/lib/notifications-store";

export const Route = createFileRoute("/admin/company-applications")({
  head: () => ({ meta: [{ title: "Company account review | Candid" }] }),
  component: CompanyApplicationReviewPage,
});

type CompanyApplication = {
  id: string;
  user_id: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  role_title: string;
  company_website: string;
  registration_number?: string;
  verified_email_domain?: string | null;
  status: string;
  created_at: string;
};

function CompanyApplicationReviewPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const list = useServerFn(listCompanyAccountApplicationsAction);
  const review = useServerFn(reviewCompanyAccountApplicationAction);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const applications = useQuery({
    queryKey: ["company-account-applications"],
    queryFn: () => list(),
    enabled: Boolean(user),
  });

  async function decide(applicationId: string, decision: "approve" | "decline") {
    setReviewingId(applicationId);
    try {
      await review({ data: { application_id: applicationId, decision, note: notes[applicationId] ?? "" } });
      await queryClient.invalidateQueries({ queryKey: ["company-account-applications"] });
      toast.success(decision === "approve" ? "Company page verified" : "Request declined");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this request.");
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-5 text-foreground sm:px-8 sm:py-8 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Candid</Link>
        <header className="mt-8 border-b border-border pb-7 sm:mt-10 sm:pb-9">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><ShieldCheck className="size-4" />Candid trust review</div>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Company page requests</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Confirm that the person can represent the organization before giving the company account official tools.</p>
        </header>
        {applications.isLoading ? <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading requests…</p> : null}
        {applications.error ? <section className="border-l-2 border-amber-300 px-4 py-5 text-sm text-amber-100">{applications.error.message || "Only the official Candid account can review company requests."}</section> : null}
        {!applications.isLoading && !applications.error && !applications.data?.length ? <section className="py-14 text-center"><BadgeCheck className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">Nothing waiting for review</h2><p className="mt-1 text-sm text-muted-foreground">New company claims will appear here.</p></section> : null}
        <div className="divide-y divide-border">
          {(applications.data ?? []).map((raw) => {
            const application = raw as CompanyApplication;
            const busy = reviewingId === application.id;
            return (
              <article key={application.id} className="grid gap-6 py-7 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)] md:gap-10">
                <div className="min-w-0">
                  <div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Building2 className="size-5" /></span><div className="min-w-0"><h2 className="truncate text-lg font-semibold">{application.company_name}</h2><p className="text-xs text-muted-foreground">#{application.company_slug} · submitted {new Date(application.created_at).toLocaleDateString("en-KE")}</p></div></div>
                  <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-muted-foreground">Applicant role</dt><dd className="mt-1">{application.role_title}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Verified email domain</dt><dd className="mt-1">{application.verified_email_domain || "Not available"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Company website</dt><dd className="mt-1 break-all"><a href={application.company_website} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">{application.company_website}</a></dd></div>
                    <div><dt className="text-xs text-muted-foreground">Registration number</dt><dd className="mt-1">{application.registration_number || "Not provided"}</dd></div>
                  </dl>
                  <p className="mt-5 text-xs leading-5 text-muted-foreground">Account ID: {application.user_id}</p>
                </div>
                <div className="space-y-4">
                  <Textarea value={notes[application.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [application.id]: event.target.value }))} maxLength={1000} placeholder="Review note (optional on approval; helpful if declined)" className="min-h-24 resize-y" />
                  <div className="flex flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
                    <Button disabled={busy} onClick={() => void decide(application.id, "approve")} className="h-11 flex-1 rounded-full"><Check className="size-4" />Approve and verify</Button>
                    <Button disabled={busy} variant="outline" onClick={() => void decide(application.id, "decline")} className="h-11 flex-1 rounded-full"><X className="size-4" />Decline</Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}

