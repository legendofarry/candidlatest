import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Camera, FileCheck2, Fingerprint, Loader2, ShieldCheck, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { notify as toast } from "@/lib/notifications-store";
import {
  discardModeratorEvidenceUploadAction,
  getMyModeratorIdentityStatusAction,
  issueModeratorEvidenceUploadAction,
  submitModeratorIdentityEvidenceAction,
} from "@/lib/moderator-verification.functions";

export const Route = createFileRoute("/moderator-verification")({
  head: () => ({ meta: [{ title: "Moderator verification | Candid" }] }),
  component: ModeratorVerificationPage,
});

type EvidenceSlot = "id_front" | "id_back" | "selfie" | "payslip";
type UploadReceipt = {
  ticket_id: string;
  slot: EvidenceSlot;
  public_id: string;
  version: number;
  signature: string;
  format: string;
  bytes: number;
};
type CloudinaryResponse = UploadReceipt & { error?: { message?: string } };

const slotLabels: Record<EvidenceSlot, string> = {
  id_front: "ID front",
  id_back: "ID back",
  selfie: "A selfie",
  payslip: "Recent payslip",
};

function ModeratorVerificationPage() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const getStatus = useServerFn(getMyModeratorIdentityStatusAction);
  const issueUpload = useServerFn(issueModeratorEvidenceUploadAction);
  const discardUpload = useServerFn(discardModeratorEvidenceUploadAction);
  const submitEvidence = useServerFn(submitModeratorIdentityEvidenceAction);
  const status = useQuery({
    queryKey: ["moderator-identity", user?.uid ?? null],
    queryFn: () => getStatus(),
    enabled: Boolean(user),
  });
  const [method, setMethod] = useState<"id" | "payslip">("id");
  const [files, setFiles] = useState<Partial<Record<EvidenceSlot, File>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requiredSlots = useMemo<EvidenceSlot[]>(
    () => method === "id" ? ["id_front", "id_back", "selfie"] : ["payslip", "selfie"],
    [method],
  );

  async function upload(slot: EvidenceSlot, file: File): Promise<UploadReceipt> {
    const ticket = await issueUpload({ data: { slot, size: file.size, mime_type: file.type as "image/jpeg" | "image/png" | "image/webp" } });
    if (ticket.alreadyApproved) throw new Error("Your moderator identity is already verified.");
    const form = new FormData();
    form.set("api_key", ticket.apiKey);
    form.set("timestamp", String(ticket.timestamp));
    form.set("public_id", ticket.publicId);
    form.set("overwrite", "false");
    form.set("type", "authenticated");
    form.set("signature", ticket.signature);
    form.set("file", file);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(ticket.cloudName)}/image/upload`, { method: "POST", body: form });
    const uploaded = await response.json().catch(() => ({})) as CloudinaryResponse;
    if (!response.ok) {
      await discardUpload({ data: { ticket_id: ticket.ticketId } }).catch(() => undefined);
      throw new Error(uploaded.error?.message ?? "An identity image could not upload.");
    }
    if (uploaded.public_id !== ticket.publicId || uploaded.bytes !== file.size || uploaded.resource_type && uploaded.resource_type !== "image" || !Number.isInteger(uploaded.version) || typeof uploaded.signature !== "string") {
      await discardUpload({ data: { ticket_id: ticket.ticketId } }).catch(() => undefined);
      throw new Error("Cloudinary could not verify an uploaded identity image.");
    }
    return { ...uploaded, slot, ticket_id: ticket.ticketId };
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !user.emailVerified) return;
    const missing = requiredSlots.filter((slot) => !files[slot]);
    if (missing.length) {
      setError(`Add ${missing.map((slot) => slotLabels[slot].toLowerCase()).join(", ")} before submitting.`);
      return;
    }
    setBusy(true);
    setError("");
    const uploaded: UploadReceipt[] = [];
    try {
      for (const slot of requiredSlots) {
        uploaded.push(await upload(slot, files[slot]!));
      }
      await submitEvidence({ data: { receipts: uploaded } });
      await queryClient.invalidateQueries({ queryKey: ["moderator-identity", user.uid] });
      setFiles({});
      toast.success("Identity check sent to Candid");
    } catch (cause) {
      await Promise.allSettled(uploaded.map((receipt) => discardUpload({ data: { ticket_id: receipt.ticket_id } })));
      const message = cause instanceof Error ? cause.message : "Could not submit your identity check.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const verificationStatus = status.data?.status ?? "not_submitted";

  return (
    <main className="min-h-[calc(100dvh-5rem)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 pb-14 pt-5 sm:px-7 sm:pt-9">
        <Button asChild variant="ghost" className="-ml-3 rounded-full text-muted-foreground"><Link to="/moderator-forum"><ArrowLeft className="size-4" />Moderator forum</Link></Button>
        <header className="mt-5 border-b border-border pb-7 sm:mt-8 sm:pb-9">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><ShieldCheck className="size-4" />Moderator trust check</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Verify before you moderate</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">A Candid reviewer checks that each moderator is a real person before the community can select them. This verification is separate from your private work history.</p>
        </header>

        {!user && !loading ? <section className="py-8"><p className="text-sm text-muted-foreground">Sign in to start a moderator identity check.</p><Button asChild className="mt-4 rounded-full"><Link to="/auth">Sign in <ArrowRight className="size-4" /></Link></Button></section> : null}
        {user && !user.emailVerified ? <section className="py-8"><p className="text-sm text-muted-foreground">Verify your email before submitting sensitive documents.</p><Button asChild className="mt-4 rounded-full"><Link to="/verify-email">Verify email <ArrowRight className="size-4" /></Link></Button></section> : null}
        {user && status.isLoading ? <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Checking your status…</p> : null}
        {user && status.isError ? <p role="alert" className="py-8 text-sm text-danger">Could not check your verification status. Refresh and try again.</p> : null}

        {user && verificationStatus === "approved" ? (
          <section className="flex items-start gap-4 border-b border-border py-8"><span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><BadgeCheck className="size-6" /></span><div><h2 className="text-lg font-semibold">Identity verified</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">You can apply to moderate from a company group where you’re a member.</p><Button asChild variant="outline" className="mt-4 rounded-full"><Link to="/companies">Find your company group <ArrowRight className="size-4" /></Link></Button></div></section>
        ) : user && verificationStatus === "pending_review" ? (
          <section className="flex items-start gap-4 border-b border-border py-8"><span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-300/10 text-amber-200"><Loader2 className="size-6" /></span><div><h2 className="text-lg font-semibold">Waiting for Candid review</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Your documents are encrypted from public and company-account access. Candid will delete the images after deciding your check.</p></div></section>
        ) : user && user.emailVerified ? (
          <form onSubmit={(event) => void submit(event)} className="py-7 sm:py-9">
            {verificationStatus === "declined" && status.data?.review_note ? <p role="alert" className="mb-6 border-l-2 border-amber-300 px-4 py-2 text-sm text-amber-100">Previous review: {status.data.review_note}</p> : null}
            <fieldset disabled={busy}>
              <legend className="text-sm font-semibold">Choose the documents you’ll provide</legend>
              <div className="mt-3 flex gap-2 border-b border-border pb-4">
                <button type="button" aria-pressed={method === "id"} onClick={() => { setMethod("id"); setFiles({}); setError(""); }} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${method === "id" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}><Fingerprint className="size-4" />National ID</button>
                <button type="button" aria-pressed={method === "payslip"} onClick={() => { setMethod("payslip"); setFiles({}); setError(""); }} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${method === "payslip" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}><FileCheck2 className="size-4" />Payslip</button>
              </div>
              <div className="divide-y divide-border">
                {requiredSlots.map((slot) => (
                  <label key={slot} className="flex min-h-20 cursor-pointer items-center gap-4 py-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">{slot === "selfie" ? <Camera className="size-5" /> : <Upload className="size-5" />}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{slotLabels[slot]}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{files[slot]?.name ?? "JPG, PNG, or WebP · up to 8 MB"}</span></span>
                    {files[slot] ? <button type="button" aria-label={`Remove ${slotLabels[slot]}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setFiles((current) => { const next = { ...current }; delete next[slot]; return next; }); }} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"><X className="size-4" /></button> : null}
                    <input type="file" accept="image/jpeg,image/png,image/webp" capture={slot === "selfie" ? "user" : undefined} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) { setError("Use a JPG, PNG, or WebP image under 8 MB."); return; } setError(""); setFiles((current) => ({ ...current, [slot]: file })); event.target.value = ""; }} />
                  </label>
                ))}
              </div>
            </fieldset>
            {method === "payslip" ? <p className="mt-4 border-l-2 border-primary/50 pl-4 text-xs leading-5 text-muted-foreground">You may cover salary amounts and tax or bank numbers. Leave your name, employer, and issue date visible.</p> : null}
            <div className="mt-6 flex items-start gap-3 border-y border-border py-4 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><p>Only the official Candid review account can view these private images. Company-group moderators and employers can never access them. Candid permanently deletes the images after a decision; only the result and review date remain.</p></div>
            {error ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
            <Button disabled={busy || requiredSlots.some((slot) => !files[slot])} className="mt-6 h-12 w-full rounded-full sm:w-auto sm:min-w-64">{busy ? <><Loader2 className="size-4 animate-spin" /> Uploading securely…</> : <>Send for Candid review <ArrowRight className="size-4" /></>}</Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
