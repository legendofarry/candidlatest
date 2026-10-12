import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, CircleAlert, Copy, CreditCard, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createMyPaymentRequest, getMyBilling, submitMyPayment } from "@/lib/billing.functions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { z } from "zod";

export const Route = createFileRoute("/billing/checkout")({
  validateSearch: z.object({ tier: z.enum(["premium", "gold"]), renewal: z.boolean().catch(false) }),
  head: () => ({ meta: [{ title: "Checkout | Candid" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { tier, renewal } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchBilling = useServerFn(getMyBilling);
  const createRequest = useServerFn(createMyPaymentRequest);
  const submitPayment = useServerFn(submitMyPayment);
  const billing = useQuery({ queryKey: ["billing", user?.uid ?? null], queryFn: () => fetchBilling(), enabled: Boolean(user) });
  const [request, setRequest] = useState<Awaited<ReturnType<typeof createRequest>> | null>(null);
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const plan = billing.data?.packages[tier];
  const createMutation = useMutation({
    mutationFn: () => createRequest({ data: { tier, renewal } }),
    onSuccess: (value) => { setRequest(value); setError(""); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Could not create payment request."),
  });
  const submitMutation = useMutation({
    mutationFn: () => {
      if (!request) throw new Error("Create the payment request first.");
      return submitPayment({ data: { paymentId: request.payment.id, transactionCode: code, payerPhone: phone.trim() || null } });
    },
    onSuccess: async () => {
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
      await navigate({ to: "/billing" });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Payment details could not be submitted."),
  });
  const configured = Boolean(billing.data?.paymentConfigured && plan?.enabled && (plan?.price_kes ?? 0) > 0);
  const isPending = createMutation.isPending || submitMutation.isPending;

  return <main className="min-h-screen bg-background pb-16"><div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 md:py-12">
    <Link to="/billing" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Billing &amp; packages</Link>
    <header className="mt-7"><div className="flex items-center gap-2 text-sm font-medium text-primary"><CreditCard className="size-4" /> Manual M-Pesa checkout</div><h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">{renewal ? `Renew ${plan?.name ?? "membership"}` : `Get ${plan?.name ?? "membership"}`}</h1><p className="mt-3 text-sm text-muted-foreground">Your paid access begins after an administrator verifies your payment against M-Pesa records.</p></header>
    {billing.isLoading ? <div className="mt-8 rounded-2xl border bg-card p-6">Loading package details…</div> : null}
    {billing.data && plan ? <div className="mt-8 grid gap-5">
      <section className="rounded-[1.6rem] border bg-card p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.17em] text-muted-foreground">Selected package</p><h2 className="mt-2 font-display text-2xl font-semibold">{plan.name}</h2></div><p className="font-display text-2xl font-semibold">KSh {plan.price_kes.toLocaleString("en-KE")}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {plan.billing_period.toLowerCase()}</span></p></div><ul className="mt-6 space-y-2 border-t pt-5">{plan.benefits.map((benefit) => <li key={benefit} className="flex gap-2 text-sm text-muted-foreground"><Check className="size-4 text-primary" />{benefit}</li>)}</ul></section>

      {!request ? <section className="rounded-[1.6rem] border bg-card p-6 shadow-sm sm:p-8"><h2 className="font-display text-xl font-semibold">Payment instructions</h2>{configured ? <><p className="mt-2 text-sm leading-6 text-muted-foreground">Create a payment request to get a unique reference and the configured M-Pesa destination.</p><Button className="mt-6 h-12 w-full rounded-xl" disabled={isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? "Preparing checkout…" : "Continue to payment"}</Button></> : <div className="mt-5 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><CircleAlert className="size-5 shrink-0 text-amber-700" /><p>M-Pesa checkout is not ready yet. Candid has not configured an enabled payment destination and package price.</p></div>}</section>
        : request.payment.status === "pending_verification" ? <section className="rounded-[1.6rem] border border-primary/30 bg-primary/5 p-6 sm:p-8"><div className="flex items-center gap-3"><ShieldCheck className="size-6 text-primary" /><h2 className="font-display text-xl font-semibold">Payment submitted</h2></div><p className="mt-3 text-sm text-muted-foreground">Your transaction is awaiting manual verification. Premium access is not active until it is approved.</p><Button className="mt-6 rounded-xl" onClick={() => void navigate({ to: "/billing" })}>View billing status</Button></section>
        : <section className="rounded-[1.6rem] border bg-card p-6 shadow-sm sm:p-8"><h2 className="font-display text-xl font-semibold">Pay with M-Pesa</h2><p className="mt-2 text-sm text-muted-foreground">Follow the instructions below, then enter the transaction code from your M-Pesa message.</p><div className="mt-5 rounded-xl bg-muted/50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{request.paymentDetails.mode === "send_money" ? "Send money to" : request.paymentDetails.mode === "till" ? "Buy goods and services · Till" : "Lipa na M-Pesa · Paybill"}</p><div className="mt-2 flex items-center justify-between gap-3"><p className="font-display text-2xl font-semibold">{request.paymentDetails.business_number}</p><button className="inline-flex items-center gap-1 text-xs text-primary" onClick={() => void navigator.clipboard?.writeText(request.paymentDetails.business_number)}><Copy className="size-3.5" />Copy</button></div><p className="mt-1 text-sm text-muted-foreground">{request.paymentDetails.account_name}</p><p className="mt-4 text-sm font-medium">Amount: KSh {request.payment.expected_amount_kes.toLocaleString("en-KE")}</p><p className="mt-3 whitespace-pre-line text-sm leading-6">{request.paymentDetails.payment_instructions}</p>{request.paymentDetails.reference_instructions ? <p className="mt-3 text-sm text-muted-foreground">{request.paymentDetails.reference_instructions}</p> : null}<div className="mt-4 rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Candid payment reference</p><p className="mt-1 flex items-center justify-between font-mono font-semibold">{request.payment.payment_reference}<button aria-label="Copy payment reference" onClick={() => void navigator.clipboard?.writeText(request.payment.payment_reference)}><Copy className="size-4 text-primary" /></button></p></div></div>
          <form className="mt-6 grid gap-4" onSubmit={(event) => { event.preventDefault(); submitMutation.mutate(); }}><label className="grid gap-2 text-sm font-medium">M-Pesa transaction code<input className="h-12 rounded-xl border bg-background px-4 font-normal uppercase tracking-wide" autoComplete="off" maxLength={12} minLength={8} value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="e.g. QWE123ABC" required /></label><label className="grid gap-2 text-sm font-medium">Payer phone <span className="text-xs font-normal text-muted-foreground">Optional</span><input className="h-12 rounded-xl border bg-background px-4 font-normal" autoComplete="tel" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07… or +254…" /></label><p className="text-xs leading-5 text-muted-foreground">Submitting a transaction code is a payment claim. Candid will review it manually and will not activate the package until it is approved.</p><Button className="h-12 rounded-xl" type="submit" disabled={isPending || code.length < 8}>{submitMutation.isPending ? "Submitting…" : "Submit payment for verification"}</Button></form>
        </section>}
      </div> : null}
    {error || billing.error ? <p className={cn("mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive")}>{error || (billing.error instanceof Error ? billing.error.message : "Could not load billing information.")}</p> : null}
    <Button variant="ghost" className="mt-5" onClick={() => void navigate({ to: "/billing" })}>Cancel checkout</Button>
  </div></main>;
}
