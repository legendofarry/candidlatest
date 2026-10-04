import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Flame, X } from "lucide-react";

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

  useEffect(() => {
    if (!isAndroidPhone() || isPreviewOrLocal() || isInstalled()) return;
    if (pathname === "/download") return;
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
    <div
      role="region"
      aria-label="Install the Candid app"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[70] md:hidden"
    >
      <div className="glass-card flex items-center gap-3 rounded-2xl border border-border p-3 shadow-2xl">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Flame className="size-5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install the Candid app</p>
          <p className="text-xs text-muted-foreground">
            Faster, full-screen, and right on your home screen.
          </p>
        </div>
        <Link
          to="/download"
          size="sm"
          className="inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Install
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install banner"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
