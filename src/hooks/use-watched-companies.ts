import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getMyCompanyWatches } from "@/lib/company-watch.functions";

/** The signed-in member's watchlist, shared by the feed, story cards and the watchlist page. */
export function useWatchedCompanies() {
  const { user } = useAuth();
  const fetchWatches = useServerFn(getMyCompanyWatches);
  const query = useQuery({
    queryKey: ["company-watches", user?.uid ?? null],
    queryFn: () => fetchWatches(),
    enabled: Boolean(user?.emailVerified),
    staleTime: 60_000,
  });
  const ids = useMemo(() => new Set((query.data ?? []).map((w) => w.company_id)), [query.data]);
  const slugs = useMemo(() => new Set((query.data ?? []).map((w) => w.company_slug)), [query.data]);
  return { ...query, ids, slugs };
}
