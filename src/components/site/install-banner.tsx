import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Download, Flame, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DISMISS_KEY = "candid-install-banner-dismissed-at";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

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
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}

function isIosBrowser() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !isInstalled();
}

/** A first-visit install invitation, backed by the browser's real PWA prompt. */
export function InstallBanner() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [iosInstructions, setIosInstructions] = useState(false);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const installed = () => {
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
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
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
      if (dismissedAt && Date.now() - dismissedAt < COOLDOWN_MS) return;
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
  }, [pathname, promptEvent]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setOpen(false);
  }

  async function install() {
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setOpen(false);
      setPromptEvent(null);
    } finally {
      dismiss();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader className="text-left">
          <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Flame className="size-6" />
          </span>
          <DialogTitle className="font-display text-2xl">Install Candid?</DialogTitle>
          <DialogDescription>
            Keep workplace stories one tap away with Candid on your home screen.
          </DialogDescription>
        </DialogHeader>
        {iosInstructions ? (
          <p className="rounded-2xl bg-secondary/60 p-4 text-sm leading-6 text-muted-foreground">
            Tap <Share className="mx-1 inline size-4 align-[-3px]" aria-label="Share" /> Share in
            your browser, then choose{" "}
            <strong className="text-foreground">Add to Home Screen</strong>.
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={dismiss}>
            <X className="size-4" /> Not now
          </Button>
          {promptEvent ? (
            <Button onClick={() => void install()} className="glow-primary">
              <Download className="size-4" /> Install app
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
