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
    </div>
  );
}
