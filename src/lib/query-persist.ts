import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";

const KEY = "candid_query_cache_v1";
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

type Snapshot = { version?: number; savedAt: number; state: unknown };
const PERSISTED_PUBLIC_QUERIES = new Set([
  "stories",
  "story-pages",
  "story",
  "filters",
  "company-scores",
  "company",
  "salary-companies",
  "salary-aggregates",
  "leaderboards",
  "compare",
  "pulse",
]);

/**
 * Keeps the read cache in local storage so returning users see the feed,
 * companies and salary data instantly instead of a blank loading state.
 */
export function enableQueryPersistence(queryClient: QueryClient) {
  if (typeof window === "undefined") return;

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const snapshot = JSON.parse(raw) as Snapshot;
      if (snapshot.version === 2 && Date.now() - snapshot.savedAt < MAX_AGE_MS) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hydrate(queryClient, snapshot.state as any);
      } else {
        localStorage.removeItem(KEY);
      }
    }
  } catch {
    localStorage.removeItem(KEY);
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  queryClient.getQueryCache().subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const state = dehydrate(queryClient, {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" &&
            typeof query.queryKey[0] === "string" &&
            PERSISTED_PUBLIC_QUERIES.has(query.queryKey[0]),
        });
        localStorage.setItem(
          KEY,
          JSON.stringify({ version: 2, savedAt: Date.now(), state } satisfies Snapshot),
        );
      } catch {
        /* storage full or unavailable */
      }
    }, 800);
  });
}

export function clearPersistedQueries() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
