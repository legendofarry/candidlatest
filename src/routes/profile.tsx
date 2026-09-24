import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { declareAccountType, getOnboardingState } from "@/lib/onboarding.functions";
import { claimVerificationBadge, getVerificationState } from "@/lib/verification.functions";
import { FollowedStories } from "@/components/site/followed-stories";
import { useAuth } from "@/hooks/useAuth";
import { inbox, notify as toast } from "@/lib/notifications-store";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile | Candid" },
      {
        name: "description",
        content: "View your anonymous Candid account and followed stories.",
      },
      { property: "og:title", content: "Your profile | Candid" },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

export function ProfilePage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const fetchOnboardingState = useServerFn(getOnboardingState);
  const onboarding = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => fetchOnboardingState(),
    enabled: Boolean(user),
  });
  const socials = onboarding.data?.socials ?? null;

  // Some accounts never got classified at signup. After a week we ask directly,
  // because company replies and employer tools depend on knowing.
  const declareType = useServerFn(declareAccountType);
  const createdAt = user?.metadata?.creationTime ? Date.parse(user.metadata.creationTime) : null;
  const olderThanAWeek = createdAt ? Date.now() - createdAt > 7 * 24 * 60 * 60 * 1000 : false;
  const askAccountType =
    Boolean(user) && onboarding.data?.accountType === "unknown" && olderThanAWeek;
  const [savingType, setSavingType] = useState(false);

  async function chooseAccountType(accountType: "individual" | "company") {
    setSavingType(true);
    try {
      await declareType({ data: { accountType } });
      await queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
      toast.success(
        accountType === "company" ? "Employer account confirmed" : "Thanks — you are set",
        {
          description:
            accountType === "company"
              ? "You can now reply to stories about your company and add your location."
              : "Your account is marked as an individual worker.",
        },
      );
    } catch {
      toast.error("Could not save that", {
        description: "Check your connection and try again.",
      });
    } finally {
      setSavingType(false);
    }
  }
  const socialLinks = socials
    ? (Object.entries(socials) as [string, string | null][]).filter(([, value]) => Boolean(value))
    : [];

  const fetchVerification = useServerFn(getVerificationState);
  const claimBadgeFn = useServerFn(claimVerificationBadge);
  const verification = useQuery({
    queryKey: ["verification-state", user?.uid ?? null],
    queryFn: () => fetchVerification(),
    enabled: Boolean(user),
  });
  const [claiming, setClaiming] = useState(false);

  async function handleClaimBadge() {
    setClaiming(true);
    try {
      const result = await claimBadgeFn();
      if (result.ok) {
        inbox.success("Badge claimed — your account is now verified", {
          dedupeKey: "badge-claimed",
        });
        await verification.refetch();
      } else {
        toast.error(result.reason);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not claim the badge");
    } finally {
      setClaiming(false);
    }
  }

  const handle = onboarding.data?.username
    ? `@${onboarding.data.username}`
    : user?.email
      ? `anon-${user.uid.slice(0, 6)}`
      : "Guest";

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-6">
      <section className="glass-card animate-rise rounded-2xl border border-border p-5">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <UserRound className="size-7" />
          </div>
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 truncate text-xl font-semibold">
              {handle}
              {verification.data?.badgeStatus === "claimed" ? (
                <BadgeCheck className="size-5 shrink-0 text-verified" aria-label="Verified" />
              ) : null}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {loading
                ? "Checking your session…"
                : user
                  ? "Signed in · your identity is never shown publicly"
                  : "Not signed in"}
            </p>
          </div>
          {user && !onboarding.data?.username && !onboarding.isLoading ? (
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <Link to="/onboarding">Claim username</Link>
            </Button>
          ) : null}
          {!user && !loading ? (
            <Button asChild size="sm" className="ml-auto glow-primary">
              <Link to="/auth">Sign in</Link>
            </Button>
          ) : null}
        </div>
        {socialLinks.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {socialLinks.map(([key, value]) => (
              <span
                key={key}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
              >
                <span className="capitalize text-foreground">{key}</span> · {value}
              </span>
            ))}
          </div>
        ) : null}
        {verification.data?.canClaim ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <BadgeCheck className="size-5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              {verification.data.companyName
                ? `Your account is recognised as ${verification.data.companyName}.`
                : "Your account is recognised as official."}{" "}
              Claim your verified badge — it's free.
            </p>
            <Button size="sm" disabled={claiming} onClick={() => void handleClaimBadge()}>
              Claim badge
            </Button>
          </div>
        ) : null}
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-verified" />
          Your email is used only to sign in. Stories, votes and comments appear under an anonymous
          handle.
        </p>
      </section>

      <FollowedStories />

      {askAccountType ? (
        <SettingsGroup title="One quick question">
          <div className="px-4 py-3">
            <p className="text-sm font-medium">Are you here as a worker or an employer?</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              We never worked this out for your account. Employers get a reply tool and a company
              page; workers keep posting anonymously as usual.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={savingType}
                onClick={() => void chooseAccountType("individual")}
              >
                I am a worker
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={savingType}
                onClick={() => void chooseAccountType("company")}
              >
                I represent a company
              </Button>
            </div>
          </div>
        </SettingsGroup>
      ) : null}

      <Button asChild variant="outline" className="w-full">
        <Link to="/settings">Account settings</Link>
      </Button>

      {user ? (
        <Button
          variant="outline"
          className="w-full text-danger"
          onClick={() => setConfirmSignOut(true)}
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      ) : null}

      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of Candid?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to post stories, comment or vote.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSignOut(false);
                void signOut().then(() => navigate({ to: "/" }));
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade space-y-1">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {children}
      </div>
    </section>
  );
}
