import { useEffect, useState } from "react";
import { Fingerprint, Loader2, LogOut, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/lib/preferences";
import {
  authenticateWithBiometric,
  hasCredentialFor,
  isUnlockedThisSession,
  markUnlocked,
} from "@/lib/biometrics";

/**
 * When the user enabled fast unlock, a fresh page load asks for the
 * fingerprint / face scan before revealing the app.
 */
export function BiometricGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const prefs = usePreferences();
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user || !prefs.biometricUnlock) {
      setLocked(false);
      return;
    }
    if (!hasCredentialFor(user.uid)) {
      setLocked(false);
      return;
    }
    setLocked(!isUnlockedThisSession());
  }, [loading, user, prefs.biometricUnlock]);

  async function unlock() {
    if (!user) return;
    setBusy(true);
    setFailed(false);
    const ok = await authenticateWithBiometric(user.uid);
    setBusy(false);
    if (ok) {
      markUnlocked();
      setLocked(false);
    } else {
      setFailed(true);
    }
  }

  if (!locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="relative flex size-28 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <span className="absolute inset-3 rounded-full border border-primary/40" />
        <Fingerprint className="size-12 text-primary" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Unlock Candid</h1>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Use your fingerprint or face to get back to your anonymous account.
        </p>
        {failed ? (
          <p className="mt-2 text-sm text-danger">Scan not recognised. Try again.</p>
        ) : null}
      </div>
      <div className="flex flex-col items-center gap-2">
        <Button onClick={unlock} disabled={busy} className="glow-primary">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanFace className="size-4" />}
          Unlock
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            markUnlocked();
            setLocked(false);
            void signOut();
          }}
        >
          <LogOut className="size-4" /> Sign out instead
        </Button>
      </div>
    </div>
  );
}
