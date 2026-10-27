import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Headset,
  Home,
  LogOut,
  PenLine,
  ScrollText,
  Scale,
  ShieldCheck,
  Settings,
  Smartphone,
  Trophy,
  UserRound,
  Wallet,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { requestPwaInstall } from "@/lib/pwa-install";
import { notify } from "@/lib/notifications-store";

type DockSheet = "you" | "help" | null;

const moreLinks = [
  {
    to: "/compare",
    label: "Compare employers",
    icon: Scale,
    hint: "Review employers side by side",
  },
  { to: "/leaderboards", label: "Leaderboards", icon: Trophy, hint: "Most discussed workplaces" },
] as const;

export function MobileDock({
  signedIn,
  userInitials,
  photoUrl,
  onLeave,
}: {
  signedIn: boolean;
  userInitials: string;
  photoUrl?: string | null | undefined;
  onLeave: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sheet, setSheet] = useState<DockSheet>(null);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    setSheet(null);
  }, [pathname]);

  useEffect(() => {
    lastY.current = window.scrollY;
    let frame = 0;
    function onScroll() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (Math.abs(delta) > 8) {
          setHidden(delta > 0 && y > 120);
          lastY.current = y;
        }
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const youActive = [
    "/profile",
    "/my-contributions",
    "/settings",
    "/leaderboards",
    "/support",
    "/guidelines",
    "/rights",
    "/privacy",
  ].some((root) => pathname.startsWith(root));

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden",
          "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          hidden && sheet === null ? "translate-y-[140%] opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        <nav
          aria-label="Primary"
          className="pointer-events-auto relative mx-3 w-full max-w-md rounded-[1.75rem] border border-border/70 glass-card px-2 pb-1.5 pt-2 shadow-2xl"
        >
          <div className="grid grid-cols-[1fr_1fr_4.5rem_1fr_1fr] items-end">
            <DockTab to="/" label="Feed" icon={Home} active={pathname === "/"} exact />
            <DockTab
              to="/companies"
              label="Companies"
              icon={Building2}
              active={pathname.startsWith("/companies")}
            />
            <div aria-hidden className="h-0" />
            <DockTab
              to="/salaries"
              label="Salaries"
              icon={Wallet}
              active={pathname.startsWith("/salaries")}
            />
            <DockButton
              label="You"
              icon={UserRound}
              active={youActive}
              initials={signedIn ? userInitials : undefined}
              photoUrl={signedIn ? photoUrl : undefined}
              onClick={() => setSheet("you")}
            />
          </div>

          <Link
            to="/post"
            aria-label="Post a story"
            className="group absolute -top-6 left-1/2 flex size-[3.4rem] -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_30px_-8px_var(--color-primary)] ring-4 ring-background transition-transform duration-200 ease-out active:scale-90"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:2.8s]" />
            <PenLine className="relative size-5 transition-transform duration-200 group-active:rotate-[-12deg]" />
          </Link>
        </nav>
      </div>

      <Drawer
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
          else setSheet((current) => current ?? "you");
        }}
      >
        <DrawerContent className="mt-0 h-[calc(100dvh-4.75rem)] max-h-[calc(100dvh-4.75rem)] overflow-hidden rounded-t-3xl md:hidden">
          <DrawerHeader className="shrink-0 text-left">
            <DrawerTitle>
              {sheet === "help" ? "Help & information" : signedIn ? "Your account" : "Join Candid"}
            </DrawerTitle>
            <DrawerDescription>
              {sheet === "help"
                ? "Guidance, support and information about Candid."
                : signedIn
                  ? ""
                  : "Sign in to post stories, comment and follow employers."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col space-y-1.5 overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sheet === "help" ? (
              <>
                <button
                  type="button"
                  onClick={() => setSheet("you")}
                  className="mb-2 flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-muted-foreground active:bg-secondary"
                >
                  <ArrowLeft className="size-4" /> Back to your account
                </button>
                <SheetRow
                  to="/support"
                  icon={Headset}
                  label="Help & support"
                  hint="Get help with your account or Candid"
                  active={pathname === "/support"}
                />
                <SheetRow
                  to="/guidelines"
                  icon={BookOpen}
                  label="Community guidelines"
                  hint="What you can and cannot post"
                  active={pathname === "/guidelines"}
                />
                <SheetRow
                  to="/rights"
                  icon={ShieldCheck}
                  label="Safety & your rights"
                  hint="Your safety and workplace rights"
                  active={pathname === "/rights"}
                />
                <SheetRow
                  to="/privacy"
                  icon={ScrollText}
                  label="Privacy, terms & disclaimer"
                  hint="How your data is handled"
                  active={pathname === "/privacy"}
                />
              </>
            ) : (
              <>
                {signedIn ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSheet(null);
                      void requestPwaInstall().catch(() =>
                        notify.error(
                          "Your browser could not open the install prompt. Try the browser menu.",
                        ),
                      );
                    }}
                    className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary px-3 py-3.5 text-left text-primary-foreground shadow-[0_0_28px_hsl(var(--primary)/0.32)] transition hover:brightness-105 active:scale-[0.99]"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-black/10">
                      <Smartphone className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">Install Candid app</span>
                      <span className="mt-0.5 block text-xs text-primary-foreground/80">
                        Check this device and install from your browser
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="rounded-full bg-black/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                    >
                      App
                    </span>
                  </button>
                ) : null}
                {signedIn ? (
                  <>
                    <SheetRow
                      to="/profile"
                      icon={UserRound}
                      label="Profile"
                      hint="Username, badges and unlock"
                      active={pathname.startsWith("/profile")}
                    />
                    <SheetRow
                      to="/my-contributions"
                      icon={PenLine}
                      label="My contributions"
                      hint="Manage your stories and comments"
                      active={pathname.startsWith("/my-contributions")}
                    />
                    <SheetRow
                      to="/settings"
                      icon={Settings}
                      label="Settings"
                      hint="Privacy, theme and lock delay"
                      active={pathname.startsWith("/settings")}
                    />
                  </>
                ) : (
                  <SheetRow
                    to="/auth"
                    icon={UserRound}
                    label="Sign in"
                    hint="Your handle appears on posts"
                    active={pathname.startsWith("/auth")}
                  />
                )}
                <div className="my-2 border-t border-border" />
                {moreLinks.map((item) => (
                  <SheetRow
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={item.label}
                    hint={item.hint}
                    active={pathname.startsWith(item.to)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setSheet("help")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-left transition-colors active:bg-secondary"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-muted-foreground">
                    <BookOpen className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      Help & information
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Support, guidelines and legal information
                    </span>
                  </span>
                </button>
                {signedIn ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSheet(null);
                      onLeave();
                    }}
                    className="mt-auto flex w-full items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-left text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/15"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                      <LogOut className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">Lock or sign out</span>
                      <span className="block truncate text-xs text-destructive/75">
                        Secure your account when you leave
                      </span>
                    </span>
                  </button>
                ) : null}
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function SheetRow({
  to,
  icon: Icon,
  label,
  hint,
  active,
  badge,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  hint: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 transition-all duration-200 active:scale-[0.98]",
        active ? "border-primary/25 bg-primary/10" : "active:bg-secondary",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
          active ? "bg-primary text-primary-foreground" : "bg-secondary/70 text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      {badge && badge > 0 ? (
        <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function DockShell({
  active,
  label,
  badge,
  initials,
  photoUrl,
  icon: Icon,
}: {
  active: boolean;
  label: string;
  badge?: number | undefined;
  initials?: string | undefined;
  photoUrl?: string | null | undefined;
  icon: typeof Home;
}) {
  return (
    <>
      <span
        className={cn(
          "relative flex h-8 w-[3.25rem] items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          active ? "bg-primary/15 text-primary" : "text-muted-foreground",
        )}
      >
        {initials ? (
          <ProfileAvatar
            photoUrl={photoUrl}
            initials={initials}
            className={cn(
              "size-6 text-[10px]",
              active && !photoUrl && "bg-primary text-primary-foreground",
              !active && !photoUrl && "bg-secondary text-foreground",
            )}
          />
        ) : (
          <Icon
            className={cn(
              "size-5 transition-transform duration-300",
              active && "-translate-y-px scale-110",
            )}
          />
        )}
        {badge && badge > 0 ? (
          <span className="absolute right-2 top-0 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-4 text-primary-foreground">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "text-[10px] font-medium transition-colors duration-200",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </>
  );
}

const tabClass =
  "flex flex-col items-center gap-0.5 py-1 transition-transform duration-200 ease-out active:scale-90";

function DockTab({
  to,
  label,
  icon,
  active,
  badge,
  exact,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  badge?: number | undefined;
  exact?: boolean | undefined;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={tabClass}
      data-exact={exact}
    >
      <DockShell active={active} label={label} icon={icon} badge={badge} />
    </Link>
  );
}

function DockButton({
  label,
  icon,
  active,
  badge,
  initials,
  photoUrl,
  onClick,
}: {
  label: string;
  icon: typeof Home;
  active: boolean;
  badge?: number | undefined;
  initials?: string | undefined;
  photoUrl?: string | null | undefined;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={tabClass}>
      <DockShell
        active={active}
        label={label}
        icon={icon}
        badge={badge}
        initials={initials}
        photoUrl={photoUrl}
      />
    </button>
  );
}
