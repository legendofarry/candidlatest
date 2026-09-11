import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { BadgeCheck, Loader2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { inbox, notify as toast } from "@/lib/notifications-store";
import {
  claimVerificationBadge,
  getVerificationState,
  snoozeVerificationPrompt,
} from "@/lib/verification.functions";

/** Full-screen prompt inviting an eligible official account to claim its free badge. */
export function BadgeClaimModal() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const loadState = useServerFn(getVerificationState);
  const claim = useServerFn(claimVerificationBadge);
  const snooze = useServerFn(snoozeVerificationPrompt);

  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || pathname === "/onboarding" || pathname === "/auth") return;
    let cancelled = false;
    void (async () => {
      try {
        const state = await loadState({ data: undefined });
        if (cancelled || !state.showPrompt) return;
        setCompanyName(state.companyName);
        setOpen(true);
      } catch {
        /* not signed in on the server yet — ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, pathname, loadState]);

  async function onClaim() {
    setBusy(true);
    try {
      const result = await claim({ data: undefined });
      if (result.ok) {
        inbox.success("Badge claimed — your account is now verified on Candid", {
          dedupeKey: "badge-claimed",
        });
        setOpen(false);
      } else {
        toast.error(result.reason);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSnooze() {
    setOpen(false);
    try {
      await snooze({ data: undefined });
    } catch {
      /* snoozing is best-effort */
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="badge-claim"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-background/90 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onSnooze}
            className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>

          <motion.div
            className="app-shell flex max-w-md flex-col items-center text-center"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 240, damping: 24 }}
          >
            <motion.div
              className="relative mb-6 flex size-24 items-center justify-center rounded-full bg-primary/10"
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}
            >
              <span className="absolute inset-0 rounded-full bg-primary/20 blur-2xl" />
              <BadgeCheck className="size-12 text-primary" />
            </motion.div>

            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Claim your verified badge
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {companyName
                ? `We matched this account to ${companyName}. Claim the badge so people know replies here are official.`
                : "This account is eligible for the official badge, so people know replies here are official."}{" "}
              It is completely free.
            </p>

            <div className="mt-8 flex w-full flex-col gap-2">
              <Button size="lg" className="glow-primary" disabled={busy} onClick={() => void onClaim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
                Claim badge
              </Button>
              <Button size="lg" variant="ghost" onClick={() => void onSnooze()}>
                Remind me later
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              You can claim it any time from your profile.
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
