import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/client";
import { notify, setNotificationUser } from "@/lib/notifications-store";
import { showSplashScreen } from "@/lib/splash-event";
import { clearPersistedQueries } from "@/lib/query-persist";
import { rememberAccount } from "@/lib/account-switching";

let knownAuthUid: string | null | undefined;

export function useAuth() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(firebaseAuth, async (nextUser) => {
      const nextUid = nextUser?.uid ?? null;
      if (knownAuthUid !== undefined && knownAuthUid !== nextUid) {
        queryClient.clear();
        clearPersistedQueries();
      }
      knownAuthUid = nextUid;
      setNotificationUser(nextUser?.uid ?? null);
      if (nextUser?.email && nextUid) {
        try {
          rememberAccount({
            uid: nextUid,
            email: nextUser.email,
            username: null,
            displayName: nextUser.displayName,
            photoURL: nextUser.photoURL,
            lastUsedAt: Date.now(),
          });
        } catch (error) {
          notify.error(error instanceof Error ? error.message : "Could not remember this account.");
        }
      }
      setUser(nextUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [queryClient]);

  async function leaveAccount() {
    await signOut(firebaseAuth);
    showSplashScreen();
  }

  return { session: user ? { user } : null, user, loading, signOut: leaveAccount };
}
