import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, Trash2, UserRoundMinus } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "@/hooks/useAuth";
import { changeMyAccountLifecycle, getMyAccountLifecycle } from "@/lib/account-lifecycle.functions";
import { notify } from "@/lib/notifications-store";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
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

export function AccountLifecycleSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const getLifecycle = useServerFn(getMyAccountLifecycle);
  const changeLifecycle = useServerFn(changeMyAccountLifecycle);
  const [confirmAction, setConfirmAction] = useState<"delete" | "deactivate" | null>(null);
  const [busy, setBusy] = useState(false);
  const isMobile = useIsMobile();
  const { data } = useQuery({
    queryKey: ["account-lifecycle", user?.uid ?? null],
    queryFn: () => getLifecycle(),
    enabled: Boolean(user),
  });

  async function submit(action: "delete" | "deactivate" | "reactivate") {
    setBusy(true);
    try {
      await changeLifecycle({ data: { action } });
      await queryClient.invalidateQueries({ queryKey: ["account-lifecycle", user?.uid] });
      await queryClient.invalidateQueries({ queryKey: ["onboarding-state", user?.uid] });
      notify.success(
        action === "delete"
          ? "Account deletion scheduled. You have 48 hours to cancel."
          : action === "deactivate"
            ? "Your account is hidden. Reactivate it within 7 days to keep it."
            : "Your account is active again.",
      );
      setConfirmAction(null);
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not update your account status.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  const status = data?.status ?? "active";
  const expiry = data?.expiresAt ? new Date(data.expiresAt) : null;

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <UserRoundMinus className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Account status</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Deactivation hides your account for up to 7 days.
          </p>
        </div>
      </div>

      {status === "active" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmAction("delete")}
          >
            Account actions
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <Clock3 className="size-4 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-sm">
            {status === "deletion_pending" ? "Deletion scheduled" : "Account deactivated"}
            {expiry ? (
              <span className="block text-xs text-muted-foreground">
                Recovery ends {expiry.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}
              </span>
            ) : null}
          </p>
          <Button size="sm" disabled={busy} onClick={() => void submit("reactivate")}>
            {busy ? "Updating…" : "Reactivate"}
          </Button>
        </div>
      )}

      <AlertDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent
          className={
            isMobile
              ? "fixed inset-x-0 bottom-0 top-auto left-0 grid w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-t-[1.75rem] rounded-b-none border-x-0 border-b-0 bg-background p-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-16px_64px_rgba(0,0,0,0.2)] data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-bottom-full"
              : "max-w-md overflow-hidden rounded-3xl border-border/70 bg-background p-0 shadow-2xl"
          }
        >
          <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/10 via-background to-sky-500/10 px-6 pb-5 pt-7 sm:px-7 sm:pb-6">
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-20 size-48 rounded-full border border-primary/15 bg-primary/10"
              animate={{ scale: [1, 1.24, 1], opacity: [0.35, 0.7, 0.35] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute -right-4 -top-14 size-36 rounded-full border border-sky-400/20"
              animate={{ scale: [1.18, 1, 1.18], opacity: [0.2, 0.55, 0.2] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative">
              <AlertDialogHeader className="space-y-2 p-0 text-left">
                <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/15 bg-background/80 text-primary shadow-sm">
                  <UserRoundMinus className="size-5" />
                </span>
                <AlertDialogTitle className="pt-1 font-display text-xl font-semibold tracking-tight sm:text-2xl">
                  Choose account action
                </AlertDialogTitle>
                <AlertDialogDescription className="max-w-sm text-sm leading-relaxed">
                  Select what you want to do with your account.
                </AlertDialogDescription>
              </AlertDialogHeader>
            </div>
          </div>
          <div className="grid gap-3 px-5 py-5 sm:px-7 sm:py-6">
            <Button
              variant="outline"
              className="group h-auto min-h-16 justify-start gap-3 rounded-2xl border-border/70 bg-background px-4 py-3 text-left shadow-sm transition-all hover:border-primary/40 hover:bg-primary/[0.03] hover:shadow-md active:scale-[0.99]"
              disabled={busy}
              onClick={() => void submit("deactivate")}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <Clock3 className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">Deactivate for 7 days</span>
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  Hide your account temporarily. You can come back anytime.
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              className="group h-auto min-h-16 justify-start gap-3 rounded-2xl border-destructive/25 bg-destructive/[0.025] px-4 py-3 text-left shadow-sm transition-all hover:border-destructive/50 hover:bg-destructive/[0.06] hover:shadow-md active:scale-[0.99]"
              disabled={busy}
              onClick={() => void submit("delete")}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-destructive">Delete account</span>
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  Schedule deletion with a 48-hour recovery period.
                </span>
              </span>
            </Button>
            {busy ? (
              <p role="status" className="text-center text-xs text-muted-foreground">
                Updating your account…
              </p>
            ) : null}
          </div>
          <AlertDialogFooter className="border-t border-border/60 bg-muted/20 px-5 py-4 sm:px-7">
            <AlertDialogCancel
              disabled={busy}
              className="mt-0 h-11 w-full rounded-xl border-0 bg-primary/10 font-medium text-foreground hover:bg-primary/15 sm:w-auto"
            >
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
