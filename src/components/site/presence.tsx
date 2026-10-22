import { useEffect, useMemo, useState } from "react";
import { onDisconnect, onValue, ref, serverTimestamp, set } from "firebase/database";
import { firebaseRealtimeDb } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/useAuth";

/** Publishes this signed-in device's availability while the RTDB connection is live. */
export function PresenceTracker() {
  const { user } = useAuth();

  useEffect(() => {
    const database = firebaseRealtimeDb;
    if (!database || !user) return;
    const connected = ref(database, ".info/connected");
    const ownPresence = ref(database, "presence/" + user.uid);
    const unsubscribe = onValue(connected, (snapshot) => {
      if (snapshot.val() !== true) return;
      void onDisconnect(ownPresence).set({ state: "offline", last_changed: serverTimestamp() });
      void set(ownPresence, { state: "online", last_changed: serverTimestamp() });
    });
    return () => {
      unsubscribe();
      void set(ownPresence, { state: "offline", last_changed: serverTimestamp() });
    };
  }, [user?.uid]);

  return null;
}

/** Subscribes only to the currently visible inbox page, without polling. */
export function useOnlineUsers(userIds: Array<string | null | undefined>) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set());
  const idsKey = [...new Set(userIds.filter((id): id is string => Boolean(id)))].sort().join("|");
  const ids = useMemo(() => idsKey ? idsKey.split("|") : [], [idsKey]);

  useEffect(() => {
    const database = firebaseRealtimeDb;
    if (!database || ids.length === 0) {
      setOnlineIds(new Set());
      return;
    }
    const unsubscribes = ids.map((id) =>
      onValue(ref(database, "presence/" + id), (snapshot) => {
        setOnlineIds((current) => {
          const next = new Set(current);
          if (snapshot.child("state").val() === "online") next.add(id);
          else next.delete(id);
          return next;
        });
      }),
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [ids]);

  return onlineIds;
}
