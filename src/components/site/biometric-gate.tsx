import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, Loader2, LogOut, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/lib/preferences";
import {
  authenticateWithBiometric,
  hasCredentialFor,
  isIdleBeyond,
  isUnlockedThisSession,
  LOCK_EVENT,
  lockNow,
  markUnlocked,
  touchActivity,
} from "@/lib/biometrics";

/** How often we re-check the idle clock while the app is open. */
const IDLE_POLL_MS = 15_000;
/** Activity that counts as "the user is still here". */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * Keeps the Firebase session signed in for a long time, but hides the app
 * behind a fingerprint / face scan when it is opened fresh, backgrounded,
 * or left idle past the chosen window.
 */
export function BiometricGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const prefs = usePreferences();
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const armed = Boolean(user) && prefs.biometricUnlock && Boolean(user && hasCredentialFor(user.uid));
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const timeoutMs = prefs.autoLockMinutes > 0 ? prefs.autoLockMinutes * 60_000 : 0;

  const lockUp = useCallback(() => {
    lockNow();
    setFailed(false);
    setLocked(true);
  }, []);

  // Initial decision on load / sign-in.
  useEffect(() => {
    if (loading) return;
    if (!armed) {
      setLocked(false);
      return;
    }
    if (!isUnlockedThisSession() || isIdleBeyond(timeoutMs)) {
      lockUp();
    }
  }, [loading, armed, timeoutMs, lockUp]);

  // Idle clock: stamp activity while unlocked, re-lock once the window passes.
  useEffect(() => {
    if (!armed || timeoutMs === 0) return;

    const stamp = () => {
      if (!lockedRef.current) touchActivity();
    };
    stamp();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, stamp, { passive: true });
    }

    const check = () => {
      if (!lockedRef.current && isIdleBeyond(timeoutMs)) lockUp();
    };
    const timer = window.setInterval(check, IDLE_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stamp();
      } else {
        check();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", check);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, stamp);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", check);
    };
  }, [armed, timeoutMs, lockUp]);

  // Manual lock requested elsewhere (e.g. from the sign-out dialog).
  useEffect(() => {
    if (!armed) return;
    const onLock = () => lockUp();
    window.addEventListener(LOCK_EVENT, onLock);
    return () => window.removeEventListener(LOCK_EVENT, onLock);
  }, [armed, lockUp]);

  async function unlock() {
    if (!user) return;
    setBusy(true);
    setFailed(false);
    const ok = await authenticateWithBiometric(user.uid);
    setBusy(false);
    if (ok) {
      markUnlocked();
      touchActivity();
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
