import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/client";
import { setNotificationUser } from "@/lib/notifications-store";
import { showSplashScreen } from "@/components/site/splash-screen";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setNotificationUser(nextUser?.uid ?? null);
      setUser(nextUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  async function leaveAccount() {
    await signOut(firebaseAuth);
    showSplashScreen();
  }

  return { session: user ? { user } : null, user, loading, signOut: leaveAccount };
}
