import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  Flame,
  Home,
  Info,
  LogOut,
  MessagesSquare,
  MoreHorizontal,
  PenLine,
  Search,
  Trophy,
  UserRound,
  Wallet,
} from "lucide-react";
import { BiometricGate } from "@/components/site/biometric-gate";
import { BackButton } from "@/components/site/back-button";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { SplashScreen } from "@/components/site/splash-screen";
import { RouteProgress } from "@/components/site/route-progress";
import { NotificationBanners } from "@/components/site/notification-banners";
import { NotificationsOverlay } from "@/components/site/notifications-overlay";
import { BadgeClaimModal } from "@/components/site/badge-claim-modal";
import { toggleNotifications, useUnreadCount } from "@/lib/notifications-store";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUnreadMessages } from "@/lib/messaging.functions";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Primary tabs — kept deliberately small so the bottom bar stays sleek. */
const nav = [
  { to: "/", label: "Feed", icon: Home },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/post", label: "Post", icon: PenLine },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

/** Secondary destinations live in the header overflow menu. */
const moreNav = [
  { to: "/salaries", label: "Salary insights", icon: Wallet },
  { to: "/leaderboards", label: "Leaderboards", icon: Trophy },
  { to: "/about", label: "About Candid", icon: Info },
] as const;

/** Routes rendered as nested/detail views: no bottom nav, always a back action. */
function isNestedRoute(pathname: string) {
  if (pathname === "/") return false;
  if (nav.some((item) => item.to === pathname)) return false;
  return true;
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = useUnreadCount();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const fetchUnreadMessages = useServerFn(getUnreadMessages);
  const { data: messageState } = useQuery({
    queryKey: ["unread-messages", user?.uid ?? null],
    queryFn: () => fetchUnreadMessages(),
    enabled: Boolean(user),
    refetchInterval: 20000,
  });
  const unreadMessages = messageState?.unread ?? 0;

  const nested = isNestedRoute(pathname);
  const showFooter = pathname === "/";

  return (
    <div className="min-h-screen bg-background">
      <SplashScreen />
      <RouteProgress />
      <NotificationBanners />
      <NotificationsOverlay />
      <BadgeClaimModal />
      <header className="sticky top-0 z-[80] border-b border-border glass-card">
        <div className="app-shell flex h-16 items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <Flame className="size-5 text-primary" />
            <span className="font-display text-lg font-semibold tracking-tight">Candid</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  pathname === item.to && "bg-secondary text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              to="/messages"
              aria-label="Messages"
              className={cn(
                "relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                pathname.startsWith("/messages") && "bg-secondary text-foreground",
              )}
            >
              <MessagesSquare className="size-4" />
              {unreadMessages > 0 ? (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {unreadMessages > 9 ? "9+" : unreadMessages}
                </span>
              ) : null}
            </Link>
            <Link
              to="/search"
              aria-label="Search Candid"
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                pathname === "/search" && "bg-secondary text-foreground",
              )}
            >
              <Search className="size-4" />
            </Link>
            <button
              type="button"
              onClick={toggleNotifications}
              aria-label="Toggle notifications"
              className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Bell className="size-4" />
              {unread > 0 ? (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </button>
            <ThemeToggle />
            <Button asChild size="sm" className="glow-primary hidden sm:inline-flex">
              <Link to="/post">
                <PenLine className="size-4" /> Post a story
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Explore</DropdownMenuLabel>
                {moreNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.to} asChild>
                      <Link to={item.to}>
                        <Icon className="size-4" /> {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                {user ? (
                  <DropdownMenuItem onSelect={() => setConfirmSignOut(true)}>
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem asChild>
                    <Link to="/auth">Sign in</Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {nested ? (
          <div className="app-shell flex h-11 items-center border-t border-border/60">
            <BackButton />
          </div>
        ) : null}
      </header>

      <main className={cn("app-shell pt-6 md:pb-16", nested ? "pb-10" : "pb-28")}>
        <BiometricGate>{children}</BiometricGate>
      </main>

      {showFooter ? (
        <footer className="border-t border-border py-10 text-sm text-muted-foreground">
          <div className="app-shell flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/about" className="hover:text-foreground">
              About
            </Link>
            <Link to="/guidelines" className="hover:text-foreground">
              Community guidelines
            </Link>
            <Link to="/rights" className="hover:text-foreground">
              Safety &amp; your rights
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy &amp; disclaimer
            </Link>
            <span className="w-full pt-2 text-xs">
              Stories are personal opinions of anonymous contributors. Employers have a right of
              reply.
            </span>
          </div>
        </footer>
      ) : null}

      {nested ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border glass-card md:hidden">
          <div className="grid grid-cols-4">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors",
                    active && "text-primary",
                  )}
                >
                  <Icon className="size-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of Candid?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to post stories, comment or vote.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSignOut(false);
                void signOut();
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
