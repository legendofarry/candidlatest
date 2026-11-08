import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, Ellipsis, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { changeMyAccountLifecycle, getMyAccountLifecycle } from "@/lib/account-lifecycle.functions";
import { notify } from "@/lib/notifications-store";
import { Button } from "@/components/ui/button";
import { AccountControlsSheet } from "@/components/site/account-controls-sheet";

export function AccountLifecycleSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const getLifecycle = useServerFn(getMyAccountLifecycle);
  const changeLifecycle = useServerFn(changeMyAccountLifecycle);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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
      setActionsOpen(false);
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
    <div className="flex shrink-0 items-center gap-1">
      {status !== "active" ? (
        <>
          <span
            title={
              status === "deletion_pending"
                ? `Deletion scheduled${expiry ? ` · recovery ends ${expiry.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}` : ""}`
                : `Account deactivated${expiry ? ` · recovery ends ${expiry.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}` : ""}`
            }
            className="flex size-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-600"
          >
            <Clock3 className="size-4" />
            <span className="sr-only">
              {status === "deletion_pending" ? "Deletion scheduled" : "Account deactivated"}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Reactivate account"
            title="Reactivate account"
            disabled={busy}
            onClick={() => void submit("reactivate")}
            className="size-9 rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <RotateCcw className={`size-4 ${busy ? "animate-spin" : ""}`} />
          </Button>
        </>
      ) : null}
      {status === "active" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Account controls"
          title="Account controls"
          disabled={busy}
          onClick={() => setActionsOpen(true)}
          className="group size-9 rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
        >
          <Ellipsis className="size-5 transition-transform duration-300 group-hover:rotate-90" />
        </Button>
      ) : null}

      <AccountControlsSheet
        open={actionsOpen}
        onOpenChange={setActionsOpen}
        busy={busy}
        onSubmit={(action) => void submit(action)}
      />
      <AlertDialog open={actionsOpen} onOpenChange={setActionsOpen}>
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
              animate={
                reduceMotion ? {} : { scale: [1, 1.24, 1], opacity: [0.35, 0.7, 0.35] }
              }
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute -right-4 -top-14 size-36 rounded-full border border-sky-400/20"
              animate={
                reduceMotion ? {} : { scale: [1.18, 1, 1.18], opacity: [0.2, 0.55, 0.2] }
              }
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative">
              <AlertDialogHeader className="space-y-2 p-0 text-left">
                <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/15 bg-background/80 text-primary shadow-sm">
                  <UserRoundMinus className="size-5" />
                </span>
                <AlertDialogTitle className="pt-1 font-display text-xl font-semibold tracking-tight sm:text-2xl">
                  Account controls
                </AlertDialogTitle>
              </AlertDialogHeader>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3  py-5 px-5 sm:py-6">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <Button
                variant="outline"
                className="group h-auto min-h-14 w-full justify-start gap-3 rounded-2xl border-border/70 bg-background py-3 text-left shadow-sm transition-all hover:border-primary/40 hover:bg-primary/[0.03] hover:shadow-md active:scale-[0.99]"
                disabled={busy}
                onClick={() => void submit("deactivate")}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <UserRoundMinus className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">Pause</span>
                </span>
                <motion.span
                  aria-hidden="true"
                  className="text-muted-foreground"
                  whileHover={reduceMotion ? {} : { x: 3 }}
                  transition={{ duration: 0.18 }}
                >
                  <ChevronRight className="size-4" />
                </motion.span>
              </Button>
            </motion.div>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: 0.06, ease: "easeOut" }}
            >
              <Button
                variant="outline"
                className="group h-auto min-h-14 w-full justify-start gap-3 rounded-2xl border-destructive/25 bg-destructive/[0.025] px-4 py-3 text-left shadow-sm transition-all hover:border-destructive/50 hover:bg-destructive/[0.06] hover:shadow-md active:scale-[0.99]"
                disabled={busy}
                onClick={() => void submit("delete")}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <Trash2 className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-destructive">Delete</span>
                </span>
                <motion.span
                  aria-hidden="true"
                  className="text-destructive/70"
                  whileHover={reduceMotion ? {} : { x: 3 }}
                  transition={{ duration: 0.18 }}
                >
                  <ChevronRight className="size-4" />
                </motion.span>
              </Button>
            </motion.div>
            {busy ? (
              <p role="status" className="text-center text-xs text-muted-foreground">
                Updating your account…
              </p>
            ) : null}
          </div>
          <AlertDialogFooter className="border-t border-border/60 bg-muted/20 px-5 py-4 sm:px-7">
            <AlertDialogCancel
              aria-label="Close account controls"
              title="Close"
              disabled={busy}
              className="mt-0 size-11 rounded-xl border-0 bg-primary/10 p-0 text-foreground hover:bg-primary/15"
            >
              <X className="size-4" />
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
