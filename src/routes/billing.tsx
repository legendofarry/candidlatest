import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, CalendarClock, Check, ChevronRight, CreditCard, Flame, RefreshCw, Sparkles, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyBilling } from "@/lib/billing.functions";
import { requestMyBasicDowngrade } from "@/lib/billing.functions";
import { switchMyMembership } from "@/lib/membership.functions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing & packages | Candid" }] }),
  component: BillingPage,
});

function BillingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchBilling = useServerFn(getMyBilling);
  const downgrade = useServerFn(requestMyBasicDowngrade);
  const switchPackage = useServerFn(switchMyMembership);
  const billing = useQuery({
    queryKey: ["billing", user?.uid ?? null],
    queryFn: () => fetchBilling(),
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });
  const downgradeMutation = useMutation({
    mutationFn: () => downgrade(),
    onSuccess: async ({ periodEndsAt }) => {
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
      window.alert(`Your Premium access remains active until ${formatDate(periodEndsAt)}. It will then return to Basic.`);
    },
    onError: (error) => window.alert(error instanceof Error ? error.message : "Could not update renewal settings."),
  });
  const switchMutation = useMutation({
    mutationFn: (tier: "basic" | "premium" | "gold") => switchPackage({ data: { tier, requestId: crypto.randomUUID(), expectedVersion: membership?.version ?? 0 } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["billing"] }); },
    onError: (error) => window.alert(error instanceof Error ? error.message : "Could not update your package."),
  });

  const data = billing.data;
  const membership = data?.membership;
  const currentTier = membership?.tier ?? "basic";
  const isOfficial = membership?.accountType === "official";
  const plans = data?.packages;
  const awaiting = data?.payments.find((payment) => payment.status === "pending_verification" || payment.status === "awaiting_payment");
  const canRenewPremium = membership?.source === "paid" && membership.assignedTier === "premium";

  return (
    <main className="min-h-screen bg-background pb-16">
      <div className="mx-auto w-full max-w-6xl px-5 pt-8 sm:px-8 md:px-12 md:pt-12">
        <header className="max-w-3xl">
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><WalletCards className="size-4" /> Billing &amp; packages</div>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{isOfficial ? "Official Candid access" : "Your membership"}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{isOfficial ? "Gold access is complimentary for the official Candid account." : "Manage your package and payment history."}</p>
        </header>

        {billing.isLoading ? <div className="mt-8 rounded-3xl border bg-card p-8 text-sm text-muted-foreground">Loading billing details…</div> : null}
        {billing.error ? <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{billing.error instanceof Error ? billing.error.message : "Billing information could not be loaded."}</div> : null}

        {data ? <>
          <section className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
            <article className="rounded-[1.7rem] border bg-card p-6 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">Current package</p><h2 className="mt-2 font-display text-3xl font-semibold">{capitalize(currentTier)}</h2></div>
                <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{statusLabel(membership?.status, membership?.source)}</span>
              </div>
              {membership?.periodEndsAt ? <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="size-4" />{membership.cancelAtPeriodEnd ? "Access ends " : "Renews manually by "}{formatDate(membership.periodEndsAt)}</p> : null}
              {awaiting ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"><div><p className="font-semibold">Payment awaiting verification</p><p className="mt-1 text-sm text-muted-foreground">Ref {awaiting.payment_reference} · KSh {awaiting.expected_amount_kes.toLocaleString("en-KE")}</p></div><span className="text-xs font-medium text-amber-700">Pending</span></div> : null}
              {membership?.status === "expired" ? <p className="mt-4 text-sm text-muted-foreground">Your previous paid period has ended. Renew to restore its benefits.</p> : null}
              {!isOfficial && membership?.source === "paid" && membership.assignedTier === "premium" && !membership.cancelAtPeriodEnd ? <Button className="mt-6 rounded-xl" variant="outline" disabled={downgradeMutation.isPending} onClick={() => { if (window.confirm("Premium access will continue until the current period ends. Your account and content stay intact. Continue?")) downgradeMutation.mutate(); }}>Move to Basic at expiry</Button> : null}
            </article>
            <article className="rounded-[1.7rem] border bg-card p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CreditCard className="size-5" /></span><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">Payments</p><h2 className="mt-1 font-display text-xl font-semibold">Manual M-Pesa</h2></div></div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">Your package activates only after an administrator matches the transaction in M-Pesa records.</p>
              <p className="mt-4 text-sm">{data.paymentConfigured ? "Checkout is available for enabled packages." : "Checkout is not configured yet."}</p>
            </article>
          </section>

          {!isOfficial ? <section className="mt-10">
            <div className="mb-5"><h2 className="font-display text-2xl font-semibold">Available packages</h2><p className="mt-1 text-sm text-muted-foreground">Paid access starts after manual payment verification.</p></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(Object.entries(plans ?? {}) as ["basic" | "premium" | "gold", NonNullable<typeof plans>["basic"]][]).map(([tier, plan]) => {
                const current = currentTier === tier;
                const renew = tier === membership?.assignedTier && canRenewPremium && membership?.status === "expired";
                const pending = data.payments.some((payment) => payment.package_id === tier && ["awaiting_payment", "pending_verification"].includes(payment.status));
                const paidActive = membership?.source === "paid" && membership.status === "active" && Boolean(membership.periodEndsAt);
                const complimentarySwitch = membership?.canSelfSwitch === true && membership?.source !== "paid";
                const available = tier === "basic" || plan.enabled || complimentarySwitch;
                const switching = downgradeMutation.isPending || switchMutation.isPending;
                const handleChoose = () => {
                  if (tier === "basic") {
                    if (paidActive) {
                      if (window.confirm("Your paid access will continue through its current period, then return to Basic. Continue?")) downgradeMutation.mutate();
                    } else {
                      switchMutation.mutate("basic");
                    }
                  } else if (complimentarySwitch) {
                    switchMutation.mutate(tier);
                  } else {
                    void navigate({ to: "/billing/checkout", search: { tier, renewal: renew || (tier === membership?.assignedTier && canRenewPremium) } });
                  }
                };
                const Icon = tier === "basic" ? Flame : tier === "premium" ? Sparkles : BadgeCheck;
                return <article key={tier} className={cn("flex min-h-[300px] flex-col rounded-[1.6rem] border bg-card p-6 shadow-sm", current && "border-primary/60 ring-1 ring-primary/20", !available && "opacity-60")}>
                  <div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></span><div><h3 className="font-display text-xl font-semibold">{plan.name}</h3><p className="text-xs text-muted-foreground">{plan.billing_period}</p></div></div>
                  <p className="mt-6 font-display text-3xl font-semibold">{plan.price_kes === 0 ? "Free" : `KSh ${plan.price_kes.toLocaleString("en-KE")}`}<span className="ml-1 text-sm font-normal text-muted-foreground">{plan.price_kes > 0 ? "/ month" : ""}</span></p>
                  <ul className="mt-5 flex-1 space-y-2 border-t pt-5">{plan.benefits.map((benefit) => <li key={benefit} className="flex gap-2 text-sm text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{benefit}</li>)}</ul>
                  <Button className="mt-6 w-full rounded-xl" variant={current ? "outline" : "default"} disabled={current || !available || pending || switching} onClick={handleChoose}>
                    {current ? "Current package" : switching ? "Updating…" : pending ? "Payment in review" : !available ? "Unavailable" : tier === "basic" && paidActive ? membership?.cancelAtPeriodEnd ? "Basic scheduled" : "Move to Basic at expiry" : complimentarySwitch ? `Switch to ${plan.name}` : renew || (tier === membership?.assignedTier && canRenewPremium) ? "Renew Premium" : `Choose ${plan.name}`}<ChevronRight className="ml-auto size-4" />
                  </Button>
                </article>;
              })}
            </div>
          </section> : null}

          <section className="mt-12">
            <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="font-display text-2xl font-semibold">Billing history</h2><p className="mt-1 text-sm text-muted-foreground">Payment reviews and subscription periods.</p></div><Button variant="ghost" size="sm" onClick={() => void billing.refetch()}><RefreshCw className="mr-2 size-4" />Refresh</Button></div>
            {data.payments.length === 0 && data.history.length === 0 ? <div className="rounded-2xl border bg-card px-5 py-8 text-center text-sm text-muted-foreground">No billing activity yet.</div> : <div className="overflow-hidden rounded-2xl border bg-card">{data.payments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 last:border-0"><div><p className="font-medium">{payment.package_name} · KSh {payment.expected_amount_kes.toLocaleString("en-KE")}</p><p className="mt-1 text-xs text-muted-foreground">{payment.payment_reference} · {formatDate(payment.submitted_at || payment.created_at)}</p>{payment.rejection_reason ? <p className="mt-1 text-xs text-destructive">{payment.rejection_reason}</p> : null}</div><span className="text-sm capitalize text-muted-foreground">{payment.status.replaceAll("_", " ")}</span></div>)}{data.history.map((period) => <div key={period.id} className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"><div><p className="font-medium">{String(period["package_name"] ?? "Premium")} subscription</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(String(period["starts_at"] ?? ""))} – {formatDate(String(period["ends_at"] ?? ""))}</p></div><span className="text-sm text-muted-foreground">KSh {Number(period["amount_kes"] ?? 0).toLocaleString("en-KE")} · M-Pesa</span></div>)}</div>}
          </section>
        </> : null}
      </div>
    </main>
  );
}

function capitalize(value: string) { return value ? value[0]!.toUpperCase() + value.slice(1) : "Basic"; }
function statusLabel(status?: string, source?: string) {
  if (source === "complimentary") return "Complimentary";
  if (status === "expired") return "Expired";
  if (status === "cancelled") return "Ends at period expiry";
  if (status === "past_due") return "Payment due";
  return "Active";
}
function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
}
