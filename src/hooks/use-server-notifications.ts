import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "./useAuth";
import { syncMyNotifications } from "@/lib/notification-sync.functions";
import { ingestServerNotifications } from "@/lib/notifications-store";

/** Polls durable server notifications (mentions, company tags) into the local inbox. */
export function useServerNotificationsSync() {
  const { user } = useAuth();
  const sync = useServerFn(syncMyNotifications);
  const query = useQuery({
    queryKey: ["server-notifications", user?.uid ?? "anon"],
    queryFn: () => sync(),
    enabled: Boolean(user),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (query.data) ingestServerNotifications(query.data);
  }, [query.data]);
}
