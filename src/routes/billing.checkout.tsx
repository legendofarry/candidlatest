import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CircleAlert, Copy, CreditCard, ImagePlus, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { cancelMyPaymentRequest, createMyPaymentRequest, getMyBilling, issueMyPaymentProofUpload, submitMyPayment } from "@/lib/billing.functions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/billing/checkout")({
  validateSearch: z.object({ tier: z.enum(["premium", "gold"]), renewal: z.boolean().catch(false) }),
  head: () => ({ meta: [{ title: "Checkout | Candid" }] }),
  component: CheckoutPage,
});

type CheckoutRequest = Awaited<ReturnType<typeof createMyPaymentRequest>>;
type UploadedReceipt = {
  ticketId: string;
  publicId: string;
  version: number;
  signature: string;
  format: "jpg" | "png" | "webp";
  bytes: number;
  type: "authenticated";
};
type CloudinaryResult = {
  public_id?: string;
  resource_type?: string;
  type?: string;
  version?: number;
  signature?: string;
  format?: string;
  bytes?: number;
  error?: { message?: string };
};

function CheckoutPage() {
  const { tier, renewal } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchBilling = useServerFn(getMyBilling);
  const createRequest = useServerFn(createMyPaymentRequest);
  const issueProof = useServerFn(issueMyPaymentProofUpload);
  const submitPayment = useServerFn(submitMyPayment);
  const cancelPayment = useServerFn(cancelMyPaymentRequest);
  const billing = useQuery({
    queryKey: ["billing", user?.uid ?? null],
    queryFn: () => fetchBilling(),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });
  const [request, setRequest] = useState<CheckoutRequest | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [transactionCode, setTransactionCode] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const requestStarted = useRef(false);
  const plan = billing.data?.packages[tier];

  const createMutation = useMutation({
    mutationFn: () => createRequest({ data: { tier, renewal } }),
    onSuccess: (value) => { setRequest(value); setError(""); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Could not prepare checkout."),
  });
  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!request) throw new Error("Payment request not found.");
      return cancelPayment({ data: { paymentId: request.payment.id } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["billing", user?.uid ?? null] });
      void navigate({ to: "/billing" });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Could not cancel this payment request."),
  });

  useEffect(() => {
    if (!billing.data || request || requestStarted.current) return;
    const existing = billing.data.payments.find((payment) =>
      payment.package_id === tier && ["awaiting_payment", "pending_verification", "approved"].includes(payment.status),
    );
    if (existing) {
      setRequest({ payment: existing as CheckoutRequest["payment"], paymentDetails: billing.data.paymentDetails });
      return;
    }
    if (!billing.data.paymentConfigured || !billing.data.packages[tier]?.enabled) return;
    requestStarted.current = true;
    createMutation.mutate();
  }, [billing.data, request, tier]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!request || !receiptFile) throw new Error("Attach a screenshot or photo of your M-Pesa confirmation first.");
      const ticket = await issueProof({ data: { paymentId: request.payment.id, size: receiptFile.size, mimeType: receiptFile.type as "image/jpeg" | "image/png" | "image/webp" } });
      const form = new FormData();
      form.append("file", receiptFile);
      form.append("api_key", ticket.apiKey);
      form.append("timestamp", String(ticket.timestamp));
      form.append("public_id", ticket.publicId);
      form.append("type", ticket.type);
      form.append("overwrite", "false");
      form.append("signature", ticket.signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(ticket.cloudName)}/image/upload`, { method: "POST", body: form });
      const uploaded = await response.json().catch(() => ({})) as CloudinaryResult;
      if (!response.ok) throw new Error(uploaded.error?.message || "Could not upload the payment receipt.");
      if (
        uploaded.public_id !== ticket.publicId || uploaded.resource_type !== "image" || uploaded.type !== "authenticated" ||
        !Number.isInteger(uploaded.version) || typeof uploaded.signature !== "string" ||
        !["jpg", "png", "webp"].includes(uploaded.format ?? "") || uploaded.bytes !== receiptFile.size
      ) throw new Error("The uploaded receipt could not be verified. Please choose it again.");
      const proof: UploadedReceipt = {
        ticketId: ticket.ticketId,
        publicId: uploaded.public_id,
        version: uploaded.version!,
        signature: uploaded.signature,
        format: uploaded.format as UploadedReceipt["format"],
        bytes: uploaded.bytes!,
        type: "authenticated",
      };
      return submitPayment({ data: {
        paymentId: request.payment.id,
        transactionCode: transactionCode.trim() || null,
        payerPhone: phone.trim() || null,
        proof,
      } });
    },
    onSuccess: async () => {
      setError("");
      setReceiptFile(null);
      setRequest((previous) => previous ? { ...previous, payment: { ...previous.payment, status: "pending_verification" } } : previous);
      await queryClient.invalidateQueries({ queryKey: ["billing", user?.uid ?? null] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Payment proof could not be submitted."),
  });

  const serverPayment = billing.data?.payments.find((payment) => payment.id === request?.payment.id);
  const paymentStatus = serverPayment?.status === "approved" || serverPayment?.status === "rejected"
    ? serverPayment.status
    : request?.payment.status === "pending_verification"
      ? request.payment.status
      : serverPayment?.status ?? request?.payment.status;
  const configured = Boolean(billing.data?.paymentConfigured && plan?.enabled && (plan.price_kes ?? 0) > 0);
  const isBusy = createMutation.isPending || submitMutation.isPending;

  return (
    <main className="min-h-screen bg-background pb-16">
      <div className="mx-auto w-full max-w-2xl px-5 py-7 sm:px-8 md:py-12">
        <header>
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><CreditCard className="size-4" />Checkout</div>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">{renewal ? `Renew ${plan?.name ?? "membership"}` : `${plan?.name ?? "Membership"} membership`}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Send your payment to Candid, attach the M-Pesa confirmation, and we’ll hold your request for review.</p>
        </header>

        {billing.isLoading ? <div className="mt-8 rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Preparing your checkout…</div> : null}
        {billing.data && plan ? <div className="mt-7 space-y-5">
          <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[.17em] text-muted-foreground">Selected package</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3"><h2 className="font-display text-2xl font-semibold">{plan.name}</h2><p className="font-display text-2xl font-semibold">KSh {plan.price_kes.toLocaleString("en-KE")}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {plan.billing_period.toLowerCase()}</span></p></div>
            <ul className="mt-5 space-y-2 border-t pt-4">{plan.benefits.map((benefit) => <li key={benefit} className="flex gap-2 text-sm text-muted-foreground"><Check className="size-4 text-primary" />{benefit}</li>)}</ul>
          </section>

          {!configured ? <section className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm"><CircleAlert className="size-5 shrink-0 text-amber-700" /><p>Checkout isn’t available for this package right now. Please contact Candid support.</p></section>
            : createMutation.isPending || (!request && !error) ? <section className="flex items-center gap-3 rounded-2xl border bg-card p-5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Preparing your payment reference…</section>
              : paymentStatus === "pending_verification" ? <section className="rounded-3xl border border-primary/30 bg-primary/5 p-6 sm:p-8"><span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="size-6" /></span><h2 className="mt-4 font-display text-2xl font-semibold">Payment received for review</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Your {plan.name} request is on hold while Candid confirms the payment. Your account will update as soon as it’s approved.</p><p className="mt-4 rounded-xl border bg-background px-4 py-3 text-sm">Reference <span className="ml-1 font-mono font-semibold">{request?.payment.payment_reference}</span></p><Button className="mt-5 w-full rounded-xl" variant="outline" onClick={() => void navigate({ to: "/billing" })}>View membership status</Button></section>
                : paymentStatus === "approved" ? <section className="rounded-3xl border border-primary/30 bg-primary/5 p-6 sm:p-8"><span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Check className="size-6" /></span><h2 className="mt-4 font-display text-2xl font-semibold">Payment confirmed</h2><p className="mt-2 text-sm text-muted-foreground">Your {plan.name} membership is active on your account.</p><Button className="mt-5 w-full rounded-xl" onClick={() => void navigate({ to: "/billing" })}>Go to membership</Button></section>
                  : paymentStatus === "rejected" ? <section className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6"><h2 className="font-display text-xl font-semibold">Payment needs attention</h2><p className="mt-2 text-sm text-muted-foreground">{serverPayment?.rejection_reason || "Candid couldn’t confirm this payment. Contact support before submitting again."}</p><Button className="mt-5 rounded-xl" variant="outline" onClick={() => void navigate({ to: "/billing" })}>Back to packages</Button></section>
                    : request ? <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-7">
                      <h2 className="font-display text-xl font-semibold">Pay with M-Pesa</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Send the amount below, then attach a screenshot or photo of the successful payment.</p>
                      <div className="mt-5 rounded-2xl bg-muted/50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Send money to</p>
                        <div className="mt-2 flex items-center justify-between gap-3"><p className="font-display text-2xl font-semibold">{request.paymentDetails.business_number}</p><button className="inline-flex items-center gap-1 text-xs text-primary" onClick={() => void navigator.clipboard?.writeText(request.paymentDetails.business_number)}><Copy className="size-3.5" />Copy</button></div>
                        <p className="mt-4 text-sm font-medium">Amount: KSh {request.payment.expected_amount_kes.toLocaleString("en-KE")}</p>
                        <p className="mt-1 whitespace-pre-line text-sm leading-6 text-muted-foreground">{request.paymentDetails.payment_instructions}</p>
                        {request.paymentDetails.reference_instructions ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{request.paymentDetails.reference_instructions}</p> : null}
                        <p className="mt-4 text-xs text-muted-foreground">Candid payment reference</p><p className="mt-1 flex items-center justify-between gap-3 font-mono font-semibold">{request.payment.payment_reference}<button aria-label="Copy payment reference" onClick={() => void navigator.clipboard?.writeText(request.payment.payment_reference)}><Copy className="size-4 text-primary" /></button></p>
                      </div>
                      <form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); submitMutation.mutate(); }}>
                        <label className="grid gap-2 text-sm font-medium">M-Pesa confirmation image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setReceiptFile(event.currentTarget.files?.[0] ?? null)} className="block w-full rounded-xl border bg-background p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:font-medium" />{receiptFile ? <span className="text-xs text-muted-foreground">Selected: {receiptFile.name}</span> : <span className="text-xs text-muted-foreground">JPG, PNG, or WebP · up to 5 MB</span>}</label>
                        <label className="grid gap-2 text-sm font-medium">Transaction code <span className="text-xs font-normal text-muted-foreground">Optional if it’s visible in your receipt</span><input className="h-12 rounded-xl border bg-background px-4 font-normal uppercase tracking-wide" autoComplete="off" maxLength={12} value={transactionCode} onChange={(event) => setTransactionCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="e.g. QWE123ABC" /></label>
                        <label className="grid gap-2 text-sm font-medium">Payer phone <span className="text-xs font-normal text-muted-foreground">Optional</span><input className="h-12 rounded-xl border bg-background px-4 font-normal" autoComplete="tel" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07… or +254…" /></label>
                        <p className="text-xs leading-5 text-muted-foreground">Your receipt is stored privately and only used to verify this payment. Membership stays unchanged until Candid confirms it.</p>
                        <Button className="h-12 rounded-xl" type="submit" disabled={isBusy || !receiptFile}>{submitMutation.isPending ? <><Loader2 className="size-4 animate-spin" />Sending proof…</> : <><ImagePlus className="size-4" />I’ve paid — send proof</>}</Button>
                      </form>
                    </section> : <section className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">{error || "Could not prepare checkout. Please try again."}<Button className="mt-4 w-full rounded-xl" variant="outline" onClick={() => { setError(""); requestStarted.current = false; createMutation.mutate(); }}>Try again</Button></section>}
        </div> : null}

        {request && ["awaiting_payment", "pending_verification"].includes(paymentStatus ?? "") ? <Button className="mt-4 w-full rounded-xl" variant="outline" disabled={cancelMutation.isPending || isBusy} onClick={() => { if (window.confirm("Cancel this payment request? If you already sent money, cancelling the request will not reverse or refund the M-Pesa transfer.")) cancelMutation.mutate(); }}>{cancelMutation.isPending ? "Cancelling request…" : "Cancel payment request"}</Button> : null}
        {error && request ? <p role="alert" className={cn("mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive")}>{error}</p> : null}
        {billing.error ? <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{billing.error instanceof Error ? billing.error.message : "Could not load package details."}</p> : null}
      </div>
    </main>
  );
}
