import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { PulseLoader } from "@/components/site/route-progress";
import { enableQueryPersistence } from "@/lib/query-persist";
import { hydratePreferences } from "@/lib/preferences";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: 1000 * 60 * 60 } },
  });
  enableQueryPersistence(queryClient);
  hydratePreferences();


  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 150,
    defaultPendingMinMs: 400,
    defaultPendingComponent: () => <PulseLoader label="Loading" />,
  });

  return router;
};

