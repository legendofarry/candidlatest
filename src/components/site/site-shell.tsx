import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  FileText,
  Flame,
  Home,
  Info,
  LifeBuoy,
  LogOut,
  MessagesSquare,
  PenLine,
  Search,
  ShieldCheck,
  Trophy,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BiometricGate } from "@/components/site/biometric-gate";
import { BackButton } from "@/components/site/back-button";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { SplashScreen } from "@/components/site/splash-screen";
import { RouteProgress } from "@/components/site/route-progress";
import { NotificationBanners } from "@/components/site/notification-banners";
import { NotificationsOverlay } from "@/components/site/notifications-overlay";
import { BadgeClaimModal } from "@/components/site/badge-claim-modal";
import { SupportChat } from "@/components/site/support-chat";
import { toggleNotifications, useUnreadCount } from "@/lib/notifications-store";
import { getUnreadMessages } from "@/lib/messaging.functions";
import { useAuth } from "@/hooks/useAuth";
import { useServerNotificationsSync } from "@/hooks/use-server-notifications";
import { hasCredentialFor, requestLock } from "@/lib/biometrics";
import { setPreference, usePreferences } from "@/lib/preferences";
import { ProfilePage } from "@/routes/profile";
import { MessagesInbox } from "@/routes/messages.index";
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
import { cn } from "@/lib/utils";

const primaryNav = [
  { to: "/", label: "Feed", icon: Home },
  { to: "/companies", label: "Companies", icon: Building2 },
] as const;

const exploreNav = [
  { to: "/salaries", label: "Salary insights", icon: Wallet },
  { to: "/leaderboards", label: "Leaderboards", icon: Trophy },
  { to: "/about", label: "About Candid", icon: Info },
  { to: "/guidelines", label: "Community guidelines", icon: FileText },
  { to: "/rights", label: "Safety & your rights", icon: ShieldCheck },
  { to: "/support", label: "Help & support", icon: LifeBuoy },
] as const;

function isNestedRoute(pathname: string) {
  return !["/", "/companies", "/profile"].includes(pathname);
}

function nestedTitle(pathname: string) {
  if (pathname.startsWith("/stories/")) return "Story";
  if (pathname.startsWith("/companies/")) return "Company";
  if (pathname.startsWith("/messages/")) return "Conversation";
  if (pathname.startsWith("/salaries/")) return "Salary insight";
  return (
    {
      "/search": "Search",
      "/post": "Post a story",
      "/support": "Help & support",
      "/about": "About Candid",
      "/guidelines": "Community guidelines",
      "/rights": "Safety & your rights",
      "/privacy": "Privacy & disclaimer",
      "/leaderboards": "Leaderboards",
      "/messages": "Messages",
    }[pathname] ?? "Back"
  );
}

type RightPanel = "profile" | "messages" | null;

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  useServerNotificationsSync();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = useUnreadCount();
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const prefs = usePreferences();
  const canLock = Boolean(user && prefs.biometricUnlock && hasCredentialFor(user.uid));
  const fetchUnreadMessages = useServerFn(getUnreadMessages);
  const { data: messageState } = useQuery({
    queryKey: ["unread-messages", user?.uid ?? null],
    queryFn: () => fetchUnreadMessages(),
    enabled: Boolean(user),
    refetchInterval: 20000,
  });
  const nested = isNestedRoute(pathname);

  useEffect(() => {
    if (pathname === "/profile") setRightPanel("profile");
    if (pathname.startsWith("/messages")) setRightPanel("messages");
  }, [pathname]);

  function handleLeave() {
    if (canLock && prefs.sessionMemory === "lock") return requestLock();
    if (canLock && prefs.sessionMemory === "signout") return void signOut();
    setRememberChoice(false);
    setConfirmSignOut(true);
  }
  const togglePanel = (panel: Exclude<RightPanel, null>) =>
    setRightPanel((current) => (current === panel ? null : panel));

  return (
    <div className="min-h-screen bg-background md:pb-6">
      <SplashScreen />
      <RouteProgress />
      <NotificationBanners />
      <NotificationsOverlay />
      <BadgeClaimModal />
      <SupportChat />
      <header className="sticky top-0 z-[80] border-b border-border glass-card">
        <div className="app-shell flex h-16 items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <Flame className="size-5 text-primary" />
            <span className="font-display text-lg font-semibold tracking-tight">Candid</span>
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => togglePanel("messages")}
              aria-label="Open messages"
              className={cn(
                "relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                rightPanel === "messages" && "bg-secondary text-foreground",
              )}
            >
              <MessagesSquare className="size-4" />
              {(messageState?.unread ?? 0) > 0 ? <Count value={messageState!.unread} /> : null}
            </button>
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
              {unread > 0 ? <Count value={unread} /> : null}
            </button>
            <ThemeToggle />
            <Button asChild size="sm" className="glow-primary hidden sm:inline-flex">
              <Link to="/post">
                <PenLine className="size-4" /> Post a story
              </Link>
            </Button>
            {user ? (
              <Button variant="ghost" size="icon" aria-label="Sign out" onClick={handleLeave}>
                <LogOut className="size-4" />
              </Button>
            ) : (
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
        {nested ? (
          <div className="app-shell h-11">
            <div className="flex h-full items-center border-t border-border/60 md:ml-80">
              <div className="flex w-full items-center">
                <BackButton label={nestedTitle(pathname)} />
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <div className="app-shell relative">
        <aside
          className={cn(
            "fixed bottom-0 left-0 z-30 hidden w-72 flex-col border-r border-border bg-card/85 p-4 shadow-sm backdrop-blur md:flex",
            nested ? "top-28" : "top-20",
          )}
        >
          <nav className="space-y-1" aria-label="Main navigation">
            {primaryNav.map((item) => (
              <SidebarLink key={item.to} item={item} active={pathname === item.to} />
            ))}
            <button
              type="button"
              onClick={() => togglePanel("profile")}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                rightPanel === "profile" && "bg-secondary text-foreground",
              )}
            >
              <UserRound className="size-4" />
              Profile
            </button>
          </nav>
          <div className="my-4 border-t border-border" />
          <nav className="space-y-1" aria-label="Explore Candid">
            {exploreNav.map((item) => (
              <SidebarLink key={item.to} item={item} active={pathname === item.to} />
            ))}
          </nav>
          <div className="mt-auto rounded-2xl bg-secondary/70 p-3 text-xs text-muted-foreground">
            Your identity is never shown on the stories you share.
          </div>
        </aside>
        <main className={cn("min-w-0 pt-6 md:pb-10 md:pl-80", nested ? "pb-10" : "pb-28")}>
          <BiometricGate>{children}</BiometricGate>
        </main>
        {pathname === "/" ? (
          <footer className="border-t border-border py-10 text-sm text-muted-foreground md:ml-80">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
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
              <Link to="/support" className="hover:text-foreground">
                Help &amp; support
              </Link>
              <span className="w-full pt-2 text-xs">
                Stories are personal opinions of anonymous contributors. Employers have a right of
                reply.
              </span>
            </div>
          </footer>
        ) : null}
      </div>
      <RightWorkspace
        open={rightPanel === "profile"}
        title="Your profile"
        onClose={() => setRightPanel(null)}
      >
        <ProfilePage />
      </RightWorkspace>
      <RightWorkspace
        open={rightPanel === "messages"}
        title="Messages"
        onClose={() => setRightPanel(null)}
      >
        <MessagesInbox />
      </RightWorkspace>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border glass-card md:hidden">
        <div className="grid grid-cols-3">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors",
                  pathname === item.to && "text-primary",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
          <Link
            to="/profile"
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground",
              pathname === "/profile" && "text-primary",
            )}
          >
            <UserRound className="size-5" />
            Profile
          </Link>
        </div>
      </nav>
      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {canLock ? "Leaving for now?" : "Sign out of Candid?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {canLock
                ? "You can stay signed in on this device and just lock Candid behind your fingerprint or face, or sign out completely."
                : "You will need to sign in again to post stories, comment or vote."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {canLock ? (
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--primary)]"
                checked={rememberChoice}
                onChange={(event) => setRememberChoice(event.target.checked)}
              />
              Remember what I choose and stop asking.
            </label>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            {canLock ? (
              <AlertDialogAction
                onClick={() => {
                  setConfirmSignOut(false);
                  if (rememberChoice) setPreference("sessionMemory", "lock");
                  requestLock();
                }}
              >
                Keep me signed in — just lock
              </AlertDialogAction>
            ) : null}
            <AlertDialogAction
              className={canLock ? "bg-secondary text-foreground hover:bg-secondary/80" : ""}
              onClick={() => {
                setConfirmSignOut(false);
                if (canLock && rememberChoice) setPreference("sessionMemory", "signout");
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

function Count({ value }: { value: number }) {
  return (
    <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
      {value > 9 ? "9+" : value}
    </span>
  );
}
function SidebarLink({
  item,
  active,
}: {
  item: (typeof primaryNav)[number] | (typeof exploreNav)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        active && "bg-secondary text-foreground",
      )}
    >
      <Icon className="size-4" />
      {item.label}
    </Link>
  );
}
function RightWorkspace({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <aside className="fixed bottom-6 right-6 top-28 z-[70] hidden w-[32rem] animate-[desktop-drawer-in_220ms_cubic-bezier(0.16,1,0.3,1)] overflow-hidden rounded-3xl border border-border bg-card shadow-2xl md:flex md:flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${title}`}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
    </aside>
  );
}
