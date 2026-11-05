import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getCompanyWatchStatus, updateCompanyWatch } from "@/lib/company-watch.functions";
import { notify as toast } from "@/lib/notifications-store";

export function CompanyWatchButton({
  companyId,
  companySlug,
  companyName,
}: {
  companyId: string;
  companySlug: string;
  companyName: string;
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
      updateWatch({
        data: { company_id: companyId, company_slug: companySlug, watching },
      }),
    onSuccess: ({ watching }) => {
      queryClient.setQueryData(["company-watch", user?.uid ?? null, companyId], watching);
      void queryClient.invalidateQueries({ queryKey: ["company-watches", user?.uid] });
      toast.success(watching ? `Watching ${companyName}` : `Stopped watching ${companyName}`, {
        description: watching
          ? "We’ll notify you when a new story about this company is published."
          : "You won’t get new-story alerts for this company.",
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/auth">
          <Bell className="size-4" /> Sign in to watch
        </Link>
      </Button>
    );
  }

  if (!user.emailVerified) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/verify-email">
          <Bell className="size-4" /> Verify email to watch
        </Link>
      </Button>
    );
  }

  const watching = watch.data === true;
  const busy = watch.isLoading || mutation.isPending;

  return (
    <Button
      type="button"
      variant={watching ? "default" : "outline"}
      size="sm"
      disabled={busy}
      aria-pressed={watching}
      title={watch.isError ? "Retry loading watch status" : undefined}
      onClick={() => {
        if (watch.isError) void watch.refetch();
        else mutation.mutate(!watching);
      }}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : watching ? (
        <BellRing className="size-4" />
      ) : (
        <Bell className="size-4" />
      )}
      {watch.isError ? "Retry" : watching ? "Watching" : "Watch company"}
    </Button>
  );
}
