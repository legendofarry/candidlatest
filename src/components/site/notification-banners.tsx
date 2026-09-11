import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { dismissBanner, useBanners, type BannerNotification, type NotifyKind } from "@/lib/notifications-store";

const kindStyles: Record<NotifyKind, { icon: typeof Info; accent: string; ring: string; glow: string }> = {
  success: {
    icon: CheckCircle2,
    accent: "text-emerald-400",
    ring: "before:bg-gradient-to-r before:from-emerald-400 before:to-teal-300",
    glow: "shadow-[0_18px_60px_-24px_rgba(16,185,129,0.75)]",
  },
  error: {
    icon: XCircle,
    accent: "text-rose-400",
    ring: "before:bg-gradient-to-r before:from-rose-500 before:to-orange-400",
    glow: "shadow-[0_18px_60px_-24px_rgba(244,63,94,0.75)]",
  },
  warning: {
    icon: AlertTriangle,
    accent: "text-amber-400",
    ring: "before:bg-gradient-to-r before:from-amber-400 before:to-yellow-300",
    glow: "shadow-[0_18px_60px_-24px_rgba(245,158,11,0.7)]",
  },
  info: {
    icon: Info,
    accent: "text-primary",
    ring: "before:bg-gradient-to-r before:from-primary before:to-fuchsia-400",
    glow: "shadow-[0_18px_60px_-24px_var(--color-primary)]",
  },
};

function Banner({ banner }: { banner: BannerNotification }) {
  const [leaving, setLeaving] = useState(false);
  const style = kindStyles[banner.kind];
  const Icon = style.icon;

  useEffect(() => {
    const outTimer = setTimeout(() => setLeaving(true), banner.duration);
    const killTimer = setTimeout(() => dismissBanner(banner.id), banner.duration + 320);
    return () => {
      clearTimeout(outTimer);
      clearTimeout(killTimer);
    };
  }, [banner.id, banner.duration]);

  const close = () => {
    setLeaving(true);
    setTimeout(() => dismissBanner(banner.id), 280);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto relative w-full overflow-hidden rounded-2xl border border-border/70 bg-background/70 p-4 pl-5 backdrop-blur-xl",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
        style.ring,
        style.glow,
        leaving ? "animate-banner-out" : "animate-banner-in",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 shrink-0", style.accent)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-foreground">{banner.title}</p>
          {banner.description ? (
            <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
              {banner.description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <span
        className={cn("absolute inset-x-0 bottom-0 h-0.5 origin-left bg-current opacity-40", style.accent)}
        style={{ animation: `banner-progress ${banner.duration}ms linear forwards` }}
      />
    </div>
  );
}

export function NotificationBanners() {
  const banners = useBanners();
  if (banners.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-3 sm:left-auto sm:right-4 sm:w-[380px] sm:items-end sm:px-0"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 5.25rem)" }}
    >
      {banners.map((banner) => (
        <Banner key={banner.id} banner={banner} />
      ))}
    </div>
  );
}
