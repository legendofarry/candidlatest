import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Download, Flame, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const DISMISS_KEY = "candid-install-banner-dismissed-at";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function isAndroidPhone() {
  return /android/i.test(navigator.userAgent) && /mobile/i.test(navigator.userAgent);
}

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

/**
 * Android-only install banner with a 7-day dismiss cooldown.
 * Never shows in the Lovable preview, in development, or when already installed.
 */
export function InstallBanner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setVisible(false);
    if (pathname !== "/" || !isAndroidPhone() || isPreviewOrLocal() || isInstalled()) return;
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (dismissedAt && Date.now() - dismissedAt < COOLDOWN_MS) return;
    } catch {
      // localStorage unavailable — still show the banner.
    }
    setVisible(true);
  }, [pathname]);

  if (!visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setVisible(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Learn how to install Candid"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] left-4 z-[38] flex size-11 items-center justify-center rounded-full border border-border bg-card text-primary shadow-lg transition-transform active:scale-95 md:hidden"
      >
        <Download className="size-5" />
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[72dvh] rounded-t-[2rem] border-border bg-card px-1 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
          <DrawerHeader className="px-6 pb-2 pt-5 text-left">
            <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Flame className="size-6" />
            </span>
            <DrawerTitle className="font-display text-2xl">Take Candid with you</DrawerTitle>
            <DrawerDescription className="text-sm leading-6">
              Install Candid for a full-screen experience and quick access from your home screen.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex gap-3 px-6 pb-4 pt-3">
            <Button variant="outline" className="flex-1" onClick={dismiss}>
              <X className="size-4" /> Not now
            </Button>
            <Button asChild className="flex-1 glow-primary">
              <Link to="/download" onClick={() => setOpen(false)}>
                <Download className="size-4" /> Install app
              </Link>
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
