import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowDownToLine, Check, Flame, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { registerFirebaseServiceWorker } from "@/integrations/firebase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const DISMISS_KEY = "candid-install-banner-dismissed-at";
const LOGIN_SESSION_KEY = "candid-install-prompt-login-session";
const INSTALLED_KEY = "candid-pwa-installed";
const COOLDOWN_MS = 2 * 60 * 1000;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isPreviewOrLocal() {
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovableproject-dev.com")
  );
}

function isInstalled() {
  try {
    if (localStorage.getItem(INSTALLED_KEY) === "true") return true;
  } catch {
    // The browser's display mode check below still works without storage.
  }
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}

function isIosBrowser() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !isInstalled();
}

/** A recurring install invitation, backed by the browser's real PWA prompt. */
export function InstallBanner() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { user, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [iosInstructions, setIosInstructions] = useState(false);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installError, setInstallError] = useState(false);
  const [loginAt, setLoginAt] = useState(0);
  const [dismissCycle, setDismissCycle] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      try {
        sessionStorage.removeItem(LOGIN_SESSION_KEY);
      } catch {
        // The two-minute local cooldown still applies if session storage is unavailable.
      }
      return;
    }

    try {
      if (sessionStorage.getItem(LOGIN_SESSION_KEY) === user.uid) return;
      sessionStorage.setItem(LOGIN_SESSION_KEY, user.uid);
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      // Login state below still makes the prompt eligible again.
    }
    setLoginAt(Date.now());
  }, [authLoading, user?.uid]);

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const installed = () => {
      try {
        localStorage.setItem(INSTALLED_KEY, "true");
      } catch {
        // The browser's standalone display mode remains the source of truth.
      }
      setOpen(false);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  useEffect(() => {
    if (isPreviewOrLocal() || !("serviceWorker" in navigator)) return;
    void registerFirebaseServiceWorker().catch((error: unknown) => {
      console.warn("[PWA] Service worker registration failed", error);
    });
  }, []);

  useEffect(() => {
    if (pathname !== "/") {
      setOpen(false);
      return;
    }
    if (isPreviewOrLocal() || isInstalled()) return;
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      const elapsed = Date.now() - dismissedAt;
      if (dismissedAt > loginAt && elapsed >= 0 && elapsed < COOLDOWN_MS) {
        const cooldownTimer = window.setTimeout(
          () => setDismissCycle((cycle) => cycle + 1),
          COOLDOWN_MS - elapsed,
        );
        return () => window.clearTimeout(cooldownTimer);
      }
    } catch {
      // Browser storage can be disabled; the invite may still be shown.
    }

    const timer = window.setTimeout(() => {
      if (promptEvent || isIosBrowser()) {
        setIosInstructions(!promptEvent && isIosBrowser());
        setOpen(true);
      }
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [pathname, promptEvent, loginAt, dismissCycle]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setOpen(false);
    setDismissCycle((cycle) => cycle + 1);
  }

  async function install() {
    if (!promptEvent) return;
    setInstallError(false);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        try {
          localStorage.setItem(INSTALLED_KEY, "true");
        } catch {
          // The browser's display mode remains the source of truth.
        }
        setOpen(false);
      } else {
        dismiss();
      }
    } catch (error) {
      console.warn("[PWA] Install prompt failed", error);
      setInstallError(true);
    } finally {
      setPromptEvent(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
      <DialogContent
        aria-describedby="install-candid-description"
        className="fixed inset-x-0 bottom-0 top-auto left-0 z-[100] grid max-h-[calc(100dvh-0.5rem)] w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-t-[2rem] border-border/70 bg-background p-0 shadow-[0_-24px_80px_-24px_rgba(0,0,0,0.45)] duration-300 data-[state=closed]:slide-out-to-bottom-5 data-[state=open]:slide-in-from-bottom-5 sm:inset-auto sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:max-h-[90vh] sm:max-w-[460px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[2rem] sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95"
        hideCloseButton
      >
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 340, damping: 30 }}
          className="relative max-h-[calc(100dvh-0.5rem)] overflow-y-auto overscroll-contain sm:max-h-[90vh]"
        >
          <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 top-28 size-52 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:p-7">
            <div className="mx-auto mb-5 h-1.5 w-11 rounded-full bg-muted-foreground/25 sm:hidden" />

            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src="/icons/icon-192.png"
                  alt=""
                  className="size-14 rounded-[1.15rem] shadow-lg shadow-primary/10 ring-1 ring-border/60"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    <Flame className="size-3.5" /> Candid, one tap away
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">A little more at home.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Not now"
                className="-mr-2 -mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mb-6">
              <DialogTitle className="font-display text-[1.65rem] font-bold tracking-tight sm:text-3xl">
                Install Candid
              </DialogTitle>
              <DialogDescription
                id="install-candid-description"
                className="mt-2 max-w-sm text-sm leading-6"
              >
                Open workplace stories from your home screen, with a faster app-like experience.
              </DialogDescription>
            </div>

            {iosInstructions ? (
              <div className="mb-5 rounded-2xl border border-border/70 bg-muted/50 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <Smartphone className="size-4 text-primary" /> Add Candid
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Tap <Share className="mx-1 inline size-4 align-[-3px]" aria-label="Share" />
                  Share in your browser, then choose{" "}
                  <strong className="text-foreground">Install</strong>.
                </p>
              </div>
            ) : (
              <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="size-4" />
                </span>
                <span>Remove it any time.</span>
              </div>
            )}

            {installError ? (
              <p role="status" className="mb-4 text-sm text-destructive">
                Your browser couldn’t open the install prompt. You can try again later from the
                browser menu.
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              {promptEvent ? (
                <Button
                  onClick={() => void install()}
                  className="h-12 flex-1 rounded-2xl text-base glow-primary"
                >
                  <ArrowDownToLine className="size-4" />
                  Install
                </Button>
              ) : iosInstructions ? (
                <Button
                  onClick={dismiss}
                  className="h-12 flex-1 rounded-2xl text-base glow-primary"
                >
                  Got it
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={dismiss}
                className="h-12 rounded-2xl text-muted-foreground"
              >
                Not now
              </Button>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground/75">
              We’ll ask again in two minutes or after your next login.
            </p>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
