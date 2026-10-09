import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  ChevronDown,
  Flame,
  Headset,
  Home,
  LogOut,
  Loader2,
  MessagesSquare,
  PenLine,
  Search,
  Settings,
  ShieldAlert,
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
import { MobileDock } from "@/components/site/mobile-dock";
import { InstallBanner } from "@/components/site/install-banner";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { MechanicEasterEgg } from "@/components/site/mechanic-easter-egg";

import {
  toggleNotifications,
  useNotificationsOverlay,
  useUnreadCount,
} from "@/lib/notifications-store";
import { getUnreadMessages } from "@/lib/messaging.functions";
import { useAuth } from "@/hooks/useAuth";
import { requiresEmailVerification } from "@/lib/email-verification";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { getInvestigationHoldState } from "@/lib/account-access.functions";
import { useServerNotificationsSync } from "@/hooks/use-server-notifications";
import { hasCredentialFor, requestLock } from "@/lib/biometrics";
import { setPreference, usePreferences } from "@/lib/preferences";
import { MessagesInbox } from "@/routes/messages.index";
import { MessagesThread } from "@/routes/messages.$id";
import {
  closeMessagePanel,
  openMessagePanel,
  rememberConversation,
  useSelectedConversationId,
} from "@/lib/message-panel-state";
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
] as const;

const dockRoots = ["/", "/companies", "/salaries", "/profile"];

function isNestedRoute(pathname: string) {
  return !["/", "/companies", "/profile", "/salaries"].includes(pathname);
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
      "/settings": "Settings",
      "/billing": "Billing & packages",
      "/profile": "Your profile",
      "/about": "About Candid",
      "/guidelines": "Community guidelines",
      "/rights": "Safety & your rights",
      "/privacy": "Privacy & disclaimer",
      "/leaderboards": "Leaderboards",
      "/messages": "Messages",
    }[pathname] ?? "Back"
  );
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  useServerNotificationsSync();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const needsEmailVerification = requiresEmailVerification(user);
  const routeConversationId = pathname.match(/^\/messages\/([^/]+)\/?$/)?.[1];
  const selectedConversationId = useSelectedConversationId();
  const activeConversationId = selectedConversationId ?? routeConversationId;
  const unread = useUnreadCount();
  const { open: notificationsOpen } = useNotificationsOverlay();
  const [messagesOpen, setMessagesOpen] = useState(false);
  const onMessagesRoute =
    pathname === "/messages" || pathname === "/messages/" || Boolean(routeConversationId);
  const messagesVisible = messagesOpen || Boolean(activeConversationId) || onMessagesRoute;
  const messagePanelOpen = messagesVisible;
  const returnPathRef = useRef("/");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [mechanicEggOpen, setMechanicEggOpen] = useState(false);
  const brandTapTimer = useRef<number | null>(null);
  const prefs = usePreferences();
  const canLock = Boolean(user && prefs.biometricUnlock && hasCredentialFor(user.uid));
  const fetchProfile = useServerFn(getOnboardingState);
  const { data: accountProfile } = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => fetchProfile(),
    enabled: Boolean(user) && !needsEmailVerification,
  });
  const fetchInvestigationHold = useServerFn(getInvestigationHoldState);
  const { data: investigationState } = useQuery({
    queryKey: ["investigation-hold", user?.uid ?? null],
    queryFn: () => fetchInvestigationHold(),
    enabled: Boolean(user),
    refetchInterval: 15000,
    retry: 1,
  });
  const fetchUnreadMessages = useServerFn(getUnreadMessages);
  const { data: messageState } = useQuery({
    queryKey: ["unread-messages", user?.uid ?? null],
    queryFn: () => fetchUnreadMessages(),
    enabled: Boolean(user) && !needsEmailVerification,
    refetchInterval: 20000,
  });
  const nested = isNestedRoute(pathname);
  const standaloneDesktopRoute = [
    "/auth",
    "/post",
    "/support",
    "/profile",
    "/settings",
    "/billing",
    "/onboarding",
    "/verify-email",
  ].includes(pathname);
  const fullscreenRoute = ["/auth", "/onboarding", "/download", "/verify-email"].includes(pathname);
  const directConversationRoute = /^\/messages\/[^/]+$/.test(pathname);
  const headerBack =
    (nested && (!standaloneDesktopRoute || pathname === "/support" || pathname === "/settings")) ||
    pathname === "/profile" ||
    pathname === "/post";

  useEffect(() => {
    if (
      !needsEmailVerification ||
      pathname === "/verify-email" ||
      pathname === "/auth"
    ) return;
    void navigate({ to: "/verify-email", replace: true });
  }, [needsEmailVerification, pathname, navigate]);

  useEffect(() => {
    if (onMessagesRoute) {
      setMessagesOpen(true);
      if (routeConversationId) rememberConversation(routeConversationId);
    } else {
      setMessagesOpen(false);
      closeMessagePanel();
      returnPathRef.current = pathname;
    }
    setUserMenuOpen(false);
  }, [pathname, routeConversationId, onMessagesRoute]);

  const userInitials =
    user?.displayName
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") ||
    user?.email?.slice(0, 2).toUpperCase() ||
    "U";

  const closeMechanicEgg = useCallback(() => setMechanicEggOpen(false), []);
  useEffect(
    () => () => {
      if (brandTapTimer.current !== null) window.clearTimeout(brandTapTimer.current);
    },
    [],
  );

  function handleBrandTap(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (brandTapTimer.current !== null) {
      window.clearTimeout(brandTapTimer.current);
      brandTapTimer.current = null;
      setMechanicEggOpen(true);
      return;
    }
    brandTapTimer.current = window.setTimeout(() => {
      brandTapTimer.current = null;
      void navigate({ to: "/" });
    }, 320);
  }

  function handleLeave() {
    if (canLock && prefs.sessionMemory === "lock") return requestLock();
    if (canLock && prefs.sessionMemory === "signout") return void signOut();
    setRememberChoice(false);
    setConfirmSignOut(true);
  }

  function closeMessages() {
    setMessagesOpen(false);
    closeMessagePanel();
    if (onMessagesRoute) void navigate({ to: returnPathRef.current });
  }

  function selectConversation(conversationId: string) {
    if (window.matchMedia("(min-width: 1280px)").matches) openMessagePanel(conversationId);
    else void navigate({ to: "/messages/$id", params: { id: conversationId } });
  }

  function closeConversation() {
    if (selectedConversationId) closeMessagePanel();
    else void navigate({ to: "/messages" });
  }

  function openMessages() {
    // Messages always begins with the inbox. A thread only opens after a user
    // chooses it from that list, so the button never unexpectedly resumes a chat.
    closeMessagePanel();
    if (routeConversationId || !window.matchMedia("(min-width: 768px)").matches) {
      void navigate({ to: "/messages" });
      return;
    }
    setMessagesOpen(true);
  }

  function toggleMessages() {
    if (routeConversationId || selectedConversationId) {
      openMessages();
      return;
    }
    if (messagesVisible) closeMessages();
    else openMessages();
  }

  const showDock = dockRoots.includes(pathname) && !standaloneDesktopRoute;

  if (user && investigationState?.active) {
    return (
      <main className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-8 text-foreground">
        <div className="pointer-events-none absolute -top-64 left-1/2 size-[34rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-72 -right-48 size-[32rem] rounded-full bg-verified/10 blur-3xl" />
        <section className="relative w-full max-w-xl text-center">
          <div className="mx-auto mb-8 flex size-16 items-center justify-center rounded-[1.4rem] border border-primary/25 bg-primary/10 text-primary shadow-lg shadow-primary/10">
            <ShieldAlert className="size-8" strokeWidth={1.7} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Candid account review</p>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Access is paused for now.</h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            Your account is under investigation. You can’t use Candid while the review is in progress.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-9 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 font-semibold text-primary-foreground shadow-[0_12px_34px_hsl(var(--primary)/0.22)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
          <div className="mt-12 flex items-center justify-center gap-2 text-sm font-semibold text-foreground/80">
            <Flame className="size-4 text-primary" /> Candid
          </div>
        </section>
      </main>
    );
  }

  if (
    needsEmailVerification &&
    pathname !== "/verify-email" &&
    pathname !== "/auth"
  ) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-background px-6 text-foreground">
        <Loader2 className="mr-3 size-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Taking you to email verification…</span>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-background md:pb-6">
      <SplashScreen />
      <MechanicEasterEgg open={mechanicEggOpen} onClose={closeMechanicEgg} />
      <RouteProgress />
      <NotificationBanners />
      <NotificationsOverlay />
      <BadgeClaimModal />
      {fullscreenRoute ? null : (
        <SupportChat
          raised={dockRoots.includes(pathname)}
          mobileVisible={
            !notificationsOpen &&
            (pathname === "/" || pathname === "/profile" || pathname === "/settings")
          }
        />
      )}
      <header
        className={cn(
          "sticky top-0 z-[80] border-b border-border glass-card",
          standaloneDesktopRoute && "md:hidden",
          fullscreenRoute && "hidden",
        )}
      >
        <div className="app-shell flex h-16 items-center gap-3">
          {headerBack ? (
            <div className="flex min-w-0 items-center gap-2">
              <BackButton compact label={nestedTitle(pathname)} />
              <span className="truncate font-display text-base font-semibold tracking-tight">
                {nestedTitle(pathname)}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleBrandTap}
              aria-label="Candid home"
              className="flex items-center gap-2"
            >
              <Flame className="size-5 text-primary" />
              <span className="font-display text-lg font-semibold tracking-tight">Candid</span>
            </button>
          )}

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={toggleMessages}
              aria-label="Toggle messages"
              className={cn(
                "relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                messagesVisible && "bg-secondary text-foreground",
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
            {!user ? (
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className={cn("relative", !fullscreenRoute && pathname !== "/post" && "app-shell")}>
        <aside
          className={cn(
            "fixed bottom-0 left-0 z-30 hidden w-72 flex-col border-r border-border bg-card/95 px-4 pb-4 pt-6 shadow-sm backdrop-blur md:flex",
            "top-16",
            standaloneDesktopRoute && "md:hidden",
          )}
        >
          <nav className="space-y-7" aria-label="Main navigation">
            <div>
              <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
                Workspace
              </p>
              <div className="space-y-1">
                {primaryNav.map((item) => (
                  <SidebarLink key={item.to} item={item} active={pathname === item.to} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
                Explore
              </p>
              <div className="space-y-1">
                {exploreNav.map((item) => (
                  <SidebarLink key={item.to} item={item} active={pathname === item.to} />
                ))}
              </div>
            </div>
          </nav>
          <div className="my-5 border-t border-border" />
          <div className="mt-auto space-y-3">
            <Link
              to="/support"
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                pathname === "/support" && "bg-secondary text-foreground",
              )}
            >
              <Headset className="size-5" />
              Help &amp; support
            </Link>
            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((current) => !current)}
                  aria-expanded={userMenuOpen}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-secondary/45 p-2.5 text-left transition-colors hover:bg-secondary"
                >
                  <ProfileAvatar
                    photoUrl={accountProfile?.photoUrl}
                    initials={userInitials}
                    className="size-10 shrink-0 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {user.displayName || user.email || "My account"}
                    </div>
                    <div className="text-xs text-muted-foreground">Member account</div>
                  </div>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      userMenuOpen && "rotate-180",
                    )}
                  />
                </button>
                {userMenuOpen ? (
                  <div className="absolute bottom-full left-0 z-10 mb-2 w-full rounded-xl border border-border bg-popover p-1.5 text-sm shadow-2xl">
                    <Link
                      to="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-foreground hover:bg-secondary"
                    >
                      <UserRound className="size-4" /> Profile
                    </Link>
                    <Link
                      to="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-foreground hover:bg-secondary"
                    >
                      <Settings className="size-4" /> Settings
                    </Link>
                    <Link
                      to="/billing"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-foreground hover:bg-secondary"
                    >
                      <Wallet className="size-4" /> Billing &amp; packages
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleLeave();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-foreground hover:bg-secondary"
                    >
                      <LogOut className="size-4" /> Log out
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </div>
        </aside>
        <main
          className={cn(
            "min-w-0 md:pb-10 md:pl-80",
            fullscreenRoute || pathname === "/post" || directConversationRoute
              ? "p-0 md:pb-0"
              : "pt-6",
            !fullscreenRoute && (showDock ? "pb-32" : "pb-10"),
            standaloneDesktopRoute &&
              "md:fixed md:inset-0 md:z-[90] md:overflow-y-auto md:bg-background md:p-0",
          )}
        >
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
                Stories are personal opinions shared by members. Employers have a right of reply.
              </span>
            </div>
          </footer>
        ) : null}
      </div>
      {messagePanelOpen ? (
        <button
          type="button"
          aria-label="Close drawer"
          className={cn(
            "fixed inset-0 z-[80] hidden bg-background/45 backdrop-blur-sm",
            activeConversationId ? "xl:block" : "md:block",
          )}
          onClick={() => {
            closeMessages();
          }}
        />
      ) : null}
      <RightWorkspace
        open={messagePanelOpen}
        title="Messages"
        desktopOnly={Boolean(routeConversationId)}
        onClose={closeMessages}
      >
        <MessagesInbox onSelectConversation={selectConversation} />
      </RightWorkspace>
      <RightWorkspace
        open={messagePanelOpen && Boolean(activeConversationId)}
        title="Conversation"
        adjacent
        desktopOnly={Boolean(routeConversationId)}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-4"
        onClose={closeConversation}
      >
        <MessagesThread id={decodeURIComponent(activeConversationId ?? "")} inSidebar />
      </RightWorkspace>
      {showDock ? (
        <MobileDock
          signedIn={Boolean(user)}
          userInitials={userInitials}
          photoUrl={accountProfile?.photoUrl}
          messageUnread={messageState?.unread ?? 0}
          onLeave={handleLeave}
        />
      ) : null}
      <InstallBanner />

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
        "group flex min-h-12 items-center gap-3 rounded-xl px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        active && "bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/20",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-secondary/70 text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
function RightWorkspace({
  open,
  title,
  onClose,
  children,
  adjacent = false,
  desktopOnly = false,
  bodyClassName,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  adjacent?: boolean;
  desktopOnly?: boolean;
  bodyClassName?: string;
}) {
  if (!open) return null;
  return (
    <aside
      style={adjacent ? { right: "calc(32rem + 2.25rem)" } : undefined}
      className={cn(
        "fixed bottom-6 right-6 top-28 z-[90] hidden w-[32rem] animate-[desktop-drawer-in_220ms_cubic-bezier(0.16,1,0.3,1)] overflow-hidden rounded-3xl border border-border bg-card shadow-2xl md:flex md:flex-col",
        desktopOnly && "md:hidden xl:flex",
      )}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${title}`}>
          <X className="size-4" />
        </Button>
      </header>
      <div data-messages-scroll className={cn("min-h-0 flex-1 overflow-y-auto p-5", bodyClassName)}>
        {children}
      </div>
    </aside>
  );
}
