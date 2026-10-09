import { createFileRoute, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Check, Flame, Sparkles, WalletCards } from "lucide-react";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { MEMBERSHIP_PLANS, type MembershipTier } from "@/lib/membership";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { FloatingBackButton } from "@/components/site/floating-back-button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: "Billing & packages | Candid" },
      { name: "description", content: "Choose the Candid membership that fits how you use the platform." },
    ],
  }),
  component: BillingPage,
});

const FEATURES: Record<MembershipTier, string[]> = {
  basic: ["Read workplace stories", "Share and save stories", "Private member messaging"],
  premium: ["Everything in Basic", "Premium member badge", "Priority access to new tools"],
  gold: ["Everything in Premium", "Gold member badge", "Early access to Candid features"],
};

function BillingPage() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { user } = useAuth();
  const fetchProfile = useServerFn(getOnboardingState);
  const profile = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => fetchProfile(),
    enabled: Boolean(user),
  });
  const currentTier = profile.data?.membership?.tier ?? "basic";

  return (
    <div className="min-h-screen bg-background pb-12">
      <FloatingBackButton
        onClick={() => {
          if (canGoBack) router.history.back();
          else void router.navigate({ to: "/" });
        }}
      />
      <div className="mx-auto w-full max-w-6xl px-5 pt-8 sm:px-8 md:px-12 md:pt-14">
        <header className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <WalletCards className="size-4" /> Billing &amp; packages
          </div>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Pick the membership that feels right.
          </h1>
        </header>

        <section className="mt-10 grid max-w-md gap-4">
          {(Object.entries(MEMBERSHIP_PLANS) as [MembershipTier, (typeof MEMBERSHIP_PLANS)[MembershipTier]][])
            .filter(([tier]) => tier === currentTier)
            .map(
            ([tier, plan]) => {
              return (
                <article
                  key={tier}
                  className={cn(
                    "relative flex flex-col overflow-hidden rounded-[1.75rem] border bg-card p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl",
                    tier === currentTier ? "border-primary/60 shadow-primary/10" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn("flex size-11 items-center justify-center rounded-2xl", tier === "gold" ? "bg-amber-400/15 text-amber-500" : "bg-primary/12 text-primary")}>
                      {tier === "basic" ? <Flame className="size-5" /> : tier === "premium" ? <Sparkles className="size-5" /> : <BadgeCheck className="size-5" />}
                    </span>
                    <div>
                      <h2 className="font-display text-xl font-semibold">{plan.name}</h2>
                    </div>
                  </div>
                  <div className="mt-7 flex items-baseline gap-1">
                    <span className="font-display text-3xl font-semibold">
                      {plan.priceKes === 0 ? "Free" : `KSh ${plan.priceKes.toLocaleString("en-KE")}`}
                    </span>
                    {plan.priceKes > 0 ? <span className="text-sm text-muted-foreground">/ month</span> : null}
                  </div>
                  <ul className="mt-7 flex-1 space-y-3 border-t border-border pt-6">
                    {FEATURES[tier].map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    disabled
                    variant="default"
                    className="mt-8 h-11 w-full rounded-xl"
                  >
                    Current plan
                  </Button>
                </article>
              );
            },
            )}
        </section>
      </div>
    </div>
  );
}
