import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, UserRoundMinus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { changeMyAccountLifecycle, getMyAccountLifecycle } from "@/lib/account-lifecycle.functions";
import { notify } from "@/lib/notifications-store";
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

export function AccountLifecycleSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const getLifecycle = useServerFn(getMyAccountLifecycle);
  const changeLifecycle = useServerFn(changeMyAccountLifecycle);
  const [confirmAction, setConfirmAction] = useState<"delete" | "deactivate" | null>(null);
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
            Deactivation hides your account for up to 7 days. Deletion starts a 48-hour recovery
            period, then removes your account and sign-in.
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Choose account action</AlertDialogTitle>
            <AlertDialogDescription>
              Select what you want to do with your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 py-2">
            <Button
              variant="outline"
              className="justify-start"
              disabled={busy}
              onClick={() => setConfirmAction("deactivate")}
            >
              Deactivate for 7 days
            </Button>
            <Button
              variant="destructive"
              className="justify-start"
              disabled={busy}
              onClick={() => setConfirmAction("delete")}
            >
              Delete account
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
