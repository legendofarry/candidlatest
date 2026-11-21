import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, BadgeCheck, FileCheck2, Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { notify as toast } from "@/lib/notifications-store";
import {
  listPendingModeratorIdentityReviewsAction,
  reviewModeratorIdentityAction,
} from "@/lib/moderator-verification.functions";

export const Route = createFileRoute("/admin/moderator-applications")({
  head: () => ({ meta: [{ title: "Moderator identity review | Candid" }] }),
  component: ModeratorIdentityReviewPage,
});

function ModeratorIdentityReviewPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const loadReviews = useServerFn(listPendingModeratorIdentityReviewsAction);
  const decide = useServerFn(reviewModeratorIdentityAction);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const reviews = useQuery({
    queryKey: ["moderator-identity-reviews"],
    queryFn: () => loadReviews(),
    enabled: Boolean(user),
  });

  async function review(userId: string, decision: "approve" | "decline") {
    setBusyId(userId);
    try {
      await decide({ data: { user_id: userId, decision, note: notes[userId] ?? "" } });
      await queryClient.invalidateQueries({ queryKey: ["moderator-identity-reviews"] });
      toast.success(decision === "approve" ? "Moderator identity verified" : "Identity check declined");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete this review.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-5 text-foreground sm:px-8 sm:py-8 lg:px-12 lg:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <Button asChild variant="ghost" className="-ml-3 rounded-full text-muted-foreground"><Link to="/moderator-forum"><ArrowLeft className="size-4" />Moderator forum</Link></Button>
        <header className="mt-6 border-b border-border pb-7 sm:mt-9 sm:pb-9">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><ShieldCheck className="size-4" />Private trust queue</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Moderator identity checks</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Only the official Candid account can load this queue. Evidence images use short-lived private links and are deleted as soon as a decision is recorded.</p>
          <Button asChild variant="outline" className="mt-4 rounded-full"><Link to="/admin/company-applications">Review company accounts</Link></Button>
        </header>
        {reviews.isLoading ? <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading private requests…</p> : null}
        {reviews.isError ? <p role="alert" className="border-l-2 border-amber-300 px-4 py-5 text-sm text-amber-100">{reviews.error.message || "Only Candid staff can review these identity checks."}</p> : null}
        {!reviews.isLoading && !reviews.isError && !reviews.data?.length ? <section className="py-16 text-center"><BadgeCheck className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">No checks waiting</h2><p className="mt-1 text-sm text-muted-foreground">New moderator identity submissions will appear here.</p></section> : null}
        <div className="divide-y divide-border">
          {(reviews.data ?? []).map((item) => (
            <article key={item.user_id} className="grid gap-7 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,.65fr)] lg:gap-12">
              <div className="min-w-0">
                <div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-full bg-secondary text-sm font-semibold">{item.username.slice(0, 1).toUpperCase()}</span><div><h2 className="font-semibold">{item.username}</h2><p className="text-xs text-muted-foreground">{item.method.replaceAll("_", " ")} · submitted {new Date(item.submitted_at).toLocaleDateString("en-KE")}</p></div></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {item.evidence.map((image) => (
                    <figure key={image.slot} className="min-w-0"><figcaption className="mb-2 text-xs font-medium capitalize text-muted-foreground">{image.slot.replaceAll("_", " ")}</figcaption><a href={image.url} target="_blank" rel="noreferrer" className="block overflow-hidden border border-border bg-secondary"><img src={image.url} alt={`${image.slot.replaceAll("_", " ")} for ${item.username}`} className="aspect-[4/3] w-full object-contain" /></a></figure>
                  ))}
                </div>
                {!item.evidence.length ? <p className="mt-4 text-sm text-amber-200">The private images are missing. Decline this request and ask the applicant to resubmit.</p> : null}
              </div>
              <div className="space-y-4 lg:pt-2">
                <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><FileCheck2 className="mt-0.5 size-4 shrink-0 text-primary" />Identity verification confirms the applicant is a real person. Group activity and member endorsements are assessed separately when choosing the company moderator.</p>
                <Textarea value={notes[item.user_id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.user_id]: event.target.value }))} maxLength={1000} placeholder="Review note (optional on approval; shown to the applicant if declined)" className="min-h-24 resize-y" />
                <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row"><Button disabled={busyId === item.user_id || !item.evidence.length} onClick={() => void review(item.user_id, "approve")} className="h-11 flex-1 rounded-full"><BadgeCheck className="size-4" />Approve identity</Button><Button disabled={busyId === item.user_id} variant="outline" onClick={() => void review(item.user_id, "decline")} className="h-11 flex-1 rounded-full"><X className="size-4" />Decline and delete</Button></div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
