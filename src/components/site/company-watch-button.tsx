import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crosshair, Loader2, Radar } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { getCompanyWatchStatus, updateCompanyWatch } from "@/lib/company-watch.functions";
import { notify as toast } from "@/lib/notifications-store";
import { cn } from "@/lib/utils";

const base =
  "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-semibold transition-all duration-300 active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CompanyWatchButton({
  companyId,
  companySlug,
  companyName,
  variant = "default",
}: {
  companyId: string;
  companySlug: string;
  companyName: string;
  variant?: "default" | "hero" | "compact";
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const getStatus = useServerFn(getCompanyWatchStatus);
  const updateWatch = useServerFn(updateCompanyWatch);
  const watch = useQuery({
    queryKey: ["company-watch", user?.uid ?? null, companyId],
    queryFn: () => getStatus({ data: { company_id: companyId } }),
    enabled: Boolean(user?.emailVerified),
  });
  const mutation = useMutation({
    mutationFn: (watching: boolean) =>
      updateWatch({ data: { company_id: companyId, company_slug: companySlug, watching } }),
    onSuccess: ({ watching }) => {
      queryClient.setQueryData(["company-watch", user?.uid ?? null, companyId], watching);
      void queryClient.invalidateQueries({ queryKey: ["company-watches", user?.uid] });
      void queryClient.invalidateQueries({ queryKey: ["company-watches", user?.uid ?? null] });
      if (watching && typeof navigator !== "undefined") navigator.vibrate?.(12);
      toast.success(watching ? `Tracking ${companyName}` : `Stopped tracking ${companyName}`, {
        description: watching
          ? "You’ll get an alert when a new story about this company is published."
          : "You won’t get new-story alerts for this company.",
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const size =
    variant === "hero" ? "h-11 px-5 text-sm" : variant === "compact" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm";
  const idle = "border border-border bg-background/60 text-foreground backdrop-blur-md hover:border-primary/60 hover:text-primary";

  if (!user || !user.emailVerified) {
    return (
      <Link to={user ? "/verify-email" : "/auth"} className={cn(base, size, idle)}>
        <Crosshair className="size-4" /> {user ? "Verify email to track" : "Sign in to track"}
      </Link>
    );
  }

  const watching = watch.data === true;
  const busy = watch.isLoading || mutation.isPending;

  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={watching}
      title={watch.isError ? "Retry loading watch status" : undefined}
      onClick={() => {
        if (watch.isError) void watch.refetch();
        else mutation.mutate(!watching);
      }}
      className={cn(
        base,
        size,
        watching
          ? "bg-primary text-primary-foreground shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent),0_8px_30px_-8px_var(--primary)]"
          : idle,
      )}
    >
      {watching ? (
        <span aria-hidden className="sonar-ping absolute left-4 top-1/2 size-4 -translate-y-1/2 rounded-full bg-primary-foreground/30" />
      ) : null}
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : watching ? (
        <Radar key="on" className="reticle-lock relative size-4" />
      ) : (
        <Crosshair key="off" className="size-4 transition-transform duration-500 group-hover:rotate-90" />
      )}
      <span className="relative">
        {watch.isError ? "Retry" : watching ? "Tracking" : variant === "compact" ? "Track" : "Track company"}
      </span>
    </button>
  );
}
