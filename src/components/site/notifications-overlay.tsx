import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Bell,
  CheckCheck,
  CheckCircle2,
  Check,
  ChevronRight,
  ListFilter,
  Info,
  MoreHorizontal,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  archiveNotification,
  backToNotificationList,
  clearArchived,
  clearNotifications,
  closeNotifications,
  ingestServerNotifications,
  markAllRead,
  markRead,
  markUnread,
  openNotificationDetail,
  pruneExpired,
  removeNotification,
  unarchiveNotification,
  useNotifications,
  useNotificationsOverlay,
  type AppNotification,
  type NotificationActivityType,
  type NotifyKind,
} from "@/lib/notifications-store";
import { cn, formatCount } from "@/lib/utils";
import { openMessagePanel } from "@/lib/message-panel-state";
import { syncMyNotifications } from "@/lib/notification-sync.functions";
import { useAuth } from "@/hooks/useAuth";
import { useAutoCollapsingCount } from "@/hooks/use-auto-collapsing-count";
import { requiresEmailVerification } from "@/lib/email-verification";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const kindMeta: Record<NotifyKind, { icon: typeof Info; tint: string; ring: string }> = {
  success: {
    icon: CheckCircle2,
    tint: "text-emerald-700 dark:text-emerald-400",
    ring: "bg-emerald-500/10",
  },
  error: { icon: XCircle, tint: "text-rose-700 dark:text-rose-400", ring: "bg-rose-500/10" },
  warning: {
    icon: AlertTriangle,
    tint: "text-amber-700 dark:text-amber-400",
    ring: "bg-amber-500/10",
  },
  info: { icon: Info, tint: "text-primary", ring: "bg-primary/10" },
};

function timeAgo(ts: number) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

type PendingAction =
  | { type: "delete"; id: string }
  | { type: "read"; id: string }
  | { type: "unread"; id: string }
  | { type: "archive"; id: string }
  | { type: "unarchive"; id: string }
  | { type: "clear" }
  | { type: "emptyArchive" };

type NotificationFilter =
  "all" | "unread" | "follows" | "likes" | "comments" | "mentions" | "messages" | "other";

const notificationFilters: { id: NotificationFilter; label: string }[] = [
  { id: "all", label: "All notifications" },
  { id: "unread", label: "Unread" },
  { id: "follows", label: "Follows and requests" },
  { id: "likes", label: "Likes" },
  { id: "comments", label: "Comments and replies" },
  { id: "mentions", label: "Mentions" },
  { id: "messages", label: "Message reactions" },
  { id: "other", label: "Other" },
];

function inferActivityType(notification: AppNotification): NotificationActivityType {
  if (notification.activityType && notification.activityType !== "other") {
    return notification.activityType;
  }
  const text = `${notification.title} ${notification.description ?? ""}`.toLowerCase();
  if (text.includes("follow request") || text.includes("requested to follow"))
    return "follow_request";
  if (text.includes("followed you") || text.includes("new follower")) return "follow";
  if (text.includes("like") || text.includes("liked")) {
    return text.includes("comment") ? "comment_like" : "post_like";
  }
  if (text.includes("repl")) return "reply";
  if (text.includes("comment")) return "comment";
  if (text.includes("mention")) return "mention";
  if (text.includes("message") || text.includes("photo") || text.includes("reacted")) {
    return "message_reaction";
  }
  return "other";
}

function matchesNotificationFilter(notification: AppNotification, filter: NotificationFilter) {
  if (filter === "all") return true;
  if (filter === "unread") return !notification.read;
  const activity = inferActivityType(notification);
  if (filter === "follows") return activity === "follow" || activity === "follow_request";
  if (filter === "likes") return activity === "post_like" || activity === "comment_like";
  if (filter === "comments") return activity === "comment" || activity === "reply";
  if (filter === "mentions") return activity === "mention";
  if (filter === "messages") return activity === "message_reaction";
  return activity === "other";
}

export function NotificationsOverlay() {
  const { open, view } = useNotificationsOverlay();
  const all = useNotifications();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const fetchNotificationPage = useServerFn(syncMyNotifications);
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [tab, setTab] = useState<"inbox" | "archive">("inbox");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [notificationActionId, setNotificationActionId] = useState<string | null>(null);
  const { visibleCount, expandBy, resetVisibleCount } = useAutoCollapsingCount(20);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pullStartRef = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const serverPages = useInfiniteQuery({
    queryKey: ["notification-pages", user?.uid ?? "anon"],
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: ({ pageParam }) => fetchNotificationPage({ data: { limit: 20, cursor: pageParam } }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: open && Boolean(user) && !requiresEmailVerification(user),
  });

  useEffect(() => {
    const items = serverPages.data?.pages.flatMap((page) => page.items) ?? [];
    if (items.length) ingestServerNotifications(items);
  }, [serverPages.data]);

  const notifications = all.filter((n) => (tab === "archive" ? n.archived : !n.archived));
  const actionNotification = notifications.find((n) => n.id === notificationActionId) ?? null;
  const matchingNotifications = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notifications.filter((n) => {
      const matchesSearch =
        !query || `${n.title} ${n.description ?? ""}`.toLowerCase().includes(query);
      return matchesSearch && matchesNotificationFilter(n, filter);
    });
  }, [notifications, search, filter]);
  const archivedCount = all.reduce((total, n) => total + (n.archived ? 1 : 0), 0);

  const unread = all.reduce((total, n) => total + (n.read || n.archived ? 0 : 1), 0);

  // Sweep expired one-time notices whenever the centre is opened.
  useEffect(() => {
    if (open) pruneExpired();
  }, [open]);

  // Lock body scroll + wire Escape to the same one-step-back rule as the bell.
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (view.name !== "list") backToNotificationList();
      else closeNotifications();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, view.name]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const groups = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const today: AppNotification[] = [];
    const earlier: AppNotification[] = [];
    for (const n of matchingNotifications.slice(0, visibleCount)) {
      (n.createdAt >= startOfToday.getTime() ? today : earlier).push(n);
    }
    return { today, earlier };
  }, [matchingNotifications, visibleCount]);

  const detail =
    view.name === "detail" ? (notifications.find((n) => n.id === view.id) ?? null) : null;

  function activate(n: AppNotification) {
    markRead(n.id);
    if (n.link?.href) {
      closeNotifications();
      const messageMatch = n.link.href.match(/^\/messages\/([^/?#]+)/);
      if (messageMatch?.[1] && window.matchMedia("(min-width: 1280px)").matches) {
        openMessagePanel(decodeURIComponent(messageMatch[1]));
        return;
      }
      void navigate({ to: n.link.href as never });
      return;
    }
    openNotificationDetail(n.id);
  }

  function runPending() {
    if (!pending) return;
    if (pending.type === "delete") removeNotification(pending.id);
    if (pending.type === "read") markRead(pending.id);
    if (pending.type === "unread") markUnread(pending.id);
    if (pending.type === "archive") archiveNotification(pending.id);
    if (pending.type === "unarchive") unarchiveNotification(pending.id);
    if (pending.type === "clear") clearNotifications();
    if (pending.type === "emptyArchive") clearArchived();
    setPending(null);
  }

  function handleRefreshStart(event: TouchEvent<HTMLDivElement>) {
    if (event.currentTarget.scrollTop > 0 || !open) return;
    pullStartRef.current = event.touches[0]?.clientY ?? null;
  }

  function handleRefreshMove(event: TouchEvent<HTMLDivElement>) {
    if (pullStartRef.current === null || event.currentTarget.scrollTop > 0 || !open) return;
    const delta = (event.touches[0]?.clientY ?? pullStartRef.current) - pullStartRef.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.6, 96));
    }
  }

  function handleRefreshEnd() {
    const shouldRefresh = pullDistance >= 72;
    pullStartRef.current = null;
    if (!shouldRefresh) {
      setPullDistance(0);
      return;
    }
    setIsRefreshing(true);
    void serverPages.refetch().finally(() => {
      setPullDistance(0);
      setIsRefreshing(false);
    });
  }

  function renderNotificationList() {
    return matchingNotifications.length === 0 ? (
      <div className="border-y border-border bg-background px-4 py-12 text-center sm:px-6">
        <Bell className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          {search.trim()
            ? "No notifications match your search"
            : tab === "archive"
              ? "Archive is empty"
              : "No new notifications"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {search.trim()
            ? "Try another word or phrase."
            : tab === "archive"
              ? "Archived notifications will show up here."
              : "Fresh activity will appear here as it happens."}
        </p>
        {serverPages.hasNextPage ? (
          <Button
            variant="outline"
            size="sm"
            disabled={serverPages.isFetchingNextPage}
            className="mt-4"
            onClick={() => void serverPages.fetchNextPage()}
          >
            {serverPages.isFetchingNextPage ? "Loading notifications…" : "Load more notifications"}
          </Button>
        ) : null}
      </div>
    ) : (
      <div className="space-y-3">
        {pullDistance > 0 || isRefreshing ? (
          <div
            className="flex items-center justify-center py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
            style={{ transform: `translateY(${Math.min(pullDistance * 0.35, 18)}px)` }}
          >
            <span className={cn("flex items-center gap-2", isRefreshing && "text-primary")}>
              {isRefreshing ? (
                <Bell className="size-3.5 animate-spin" />
              ) : (
                <Bell className="size-3.5" />
              )}
              {isRefreshing
                ? "Refreshing"
                : pullDistance >= 72
                  ? "Release to refresh"
                  : "Pull to refresh"}
            </span>
          </div>
        ) : null}
        <Group
          label="Today"
          items={groups.today}
          onActivate={activate}
          onOpenActions={setNotificationActionId}
          onRequest={setPending}
        />
        <Group
          label="Earlier"
          items={groups.earlier}
          onActivate={activate}
          onOpenActions={setNotificationActionId}
          onRequest={setPending}
        />
        {matchingNotifications.length > visibleCount || serverPages.hasNextPage ? (
          <div className="flex flex-col items-center gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              Showing {formatCount(Math.min(visibleCount, matchingNotifications.length))} of{" "}
              {formatCount(matchingNotifications.length)} notifications
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={serverPages.isFetchingNextPage}
              onClick={(event) => {
                if (visibleCount < matchingNotifications.length) {
                  expandBy(20, event.currentTarget);
                } else if (serverPages.hasNextPage) {
                  const anchor = event.currentTarget;
                  void serverPages.fetchNextPage().then((result) => {
                    if (result.isSuccess) expandBy(20, anchor);
                  });
                }
              }}
            >
              {serverPages.isFetchingNextPage
                ? "Loading notifications…"
                : visibleCount < matchingNotifications.length
                  ? "Show 20 more"
                  : "Load next 20 notifications"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderTabs() {
    return (
      <div className="flex gap-2 bg-background px-4 pb-3 pt-4 sm:px-6">
        {(
          [
            { key: "inbox", label: "Inbox", count: all.length - archivedCount },
            { key: "archive", label: "Archive", count: archivedCount },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setTab(item.key);
              resetVisibleCount();
            }}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              tab === item.key && "border-primary bg-primary text-primary-foreground",
              tab !== item.key &&
                "border-border bg-transparent text-foreground hover:bg-secondary/60",
            )}
          >
            {item.label}
            {item.count > 0 ? (
              <span
                className={cn(
                  "ml-1 flex size-5 items-center justify-center rounded-full text-[11px] font-bold",
                  tab === item.key
                    ? "bg-background text-foreground"
                    : "bg-secondary text-muted-foreground",
                )}
                aria-label={item.count.toLocaleString()}
              >
                {formatCount(item.count)}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    );
  }

  function renderSearch() {
    return (
      <div className="flex items-center gap-3 bg-background px-4 pb-4 sm:px-6">
        <label className="relative block min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetVisibleCount();
            }}
            placeholder="Search notifications"
            aria-label="Search notifications"
            className="h-14 rounded-full border-2 bg-card pl-12 text-base shadow-sm placeholder:text-muted-foreground/80"
          />
        </label>
        {isMobile ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Filter notifications"
            className="relative size-12 shrink-0 rounded-full border-primary/50 bg-primary/5"
            onClick={() => setFilterSheetOpen(true)}
          >
            <ListFilter className="size-5" />
            {filter !== "all" ? (
              <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />
            ) : null}
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Filter notifications"
                className="relative size-12 shrink-0 rounded-full border-primary/50 bg-primary/5"
              >
                <ListFilter className="size-5" />
                {filter !== "all" ? (
                  <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[110] w-56">
              {notificationFilters.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => {
                    setFilter(item.id);
                    resetVisibleCount();
                  }}
                  className="justify-between"
                >
                  {item.label}
                  {filter === item.id ? <Check className="size-4 text-primary" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="notifications-overlay"
            className="pointer-events-none fixed inset-0 z-[90] flex flex-col pt-0 md:items-end md:justify-start md:pt-28 md:pr-6 xl:flex-row-reverse xl:items-start xl:gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
          >
            <motion.div
              className="pointer-events-auto absolute inset-0 bg-background/75 backdrop-blur-sm md:bg-background/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (view.name !== "list") backToNotificationList();
                else closeNotifications();
              }}
            />

            <motion.div
              ref={panelRef}
              tabIndex={-1}
              className="pointer-events-auto relative flex h-full w-full flex-col outline-none sm:mx-auto sm:my-6 sm:h-[calc(100%-3rem)] sm:max-w-2xl sm:overflow-hidden sm:rounded-3xl sm:border sm:border-border sm:bg-card/70 sm:shadow-2xl md:m-0 md:h-[calc(100vh-8rem)] md:w-[min(44rem,calc(100vw-3rem))] md:max-w-none md:bg-card md:shadow-2xl xl:shrink-0"
              initial={{ y: 32, opacity: 0, x: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, x: 0, scale: 1 }}
              exit={{ y: 24, opacity: 0, x: 40, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
            >
              <header className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-4 sm:px-6 sm:py-5">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={
                    view.name === "list" ? "Close notifications" : "Back to notifications"
                  }
                  className="!size-12 shrink-0 rounded-full border-2"
                  onClick={() =>
                    view.name === "list" ? closeNotifications() : backToNotificationList()
                  }
                >
                  <ArrowLeft className="size-4" />
                </Button>

                <div className="min-w-0">
                  <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    {view.name === "list" ? "Notifications" : "Notification"}
                  </h2>
                  <p className="text-sm font-medium text-muted-foreground">
                    {unread > 0 ? `${unread} unread` : "You're all caught up"}
                  </p>
                </div>

                <div
                  className={cn(
                    "ml-auto flex shrink-0 items-center gap-1.5",
                    view.name === "detail" && "hidden xl:flex",
                  )}
                >
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Mark all notifications as read"
                      className="!size-10 rounded-full border-2 sm:!size-12"
                      onClick={markAllRead}
                      disabled={unread === 0 || tab === "archive"}
                    >
                      <CheckCheck className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={tab === "archive" ? "Empty archive" : "Clear all notifications"}
                      className="!size-10 rounded-full border-2 sm:!size-12"
                      disabled={notifications.length === 0}
                      onClick={() =>
                        setPending({ type: tab === "archive" ? "emptyArchive" : "clear" })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                  {view.name !== "list" ? (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Close notifications"
                      className="!size-10 rounded-full border-2 sm:!size-12"
                      onClick={closeNotifications}
                    >
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </header>

              {view.name === "list" ? (
                <>
                  {renderTabs()}
                  {renderSearch()}
                </>
              ) : (
                <div className="hidden xl:block">
                  {renderTabs()}
                  {renderSearch()}
                </div>
              )}

              {view.name === "list" ? (
                <div
                  className="flex-1 overflow-y-auto bg-background pb-10 pt-1"
                  onTouchStart={handleRefreshStart}
                  onTouchMove={handleRefreshMove}
                  onTouchEnd={handleRefreshEnd}
                  onTouchCancel={handleRefreshEnd}
                >
                  {renderNotificationList()}
                </div>
              ) : (
                <>
                  <div className="hidden flex-1 overflow-y-auto bg-background pb-10 pt-1 xl:block">
                    {renderNotificationList()}
                  </div>
                  <div
                    className="flex-1 overflow-y-auto bg-background px-4 pb-10 pt-1 sm:px-6 xl:hidden"
                    onTouchStart={handleRefreshStart}
                    onTouchMove={handleRefreshMove}
                    onTouchEnd={handleRefreshEnd}
                    onTouchCancel={handleRefreshEnd}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {detail ? (
                        <motion.div
                          key="detail"
                          initial={{ opacity: 0, x: 24 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 24 }}
                          transition={{ duration: 0.2 }}
                        >
                          <DetailCard notification={detail} actions={false} />
                        </motion.div>
                      ) : (
                        <p className="py-16 text-center text-sm text-muted-foreground">
                          This notification is no longer available.
                        </p>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </motion.div>

            {view.name === "detail" ? (
              <motion.section
                aria-label="Notification details"
                className="pointer-events-auto relative hidden h-[calc(100vh-8rem)] w-[32rem] shrink-0 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl xl:flex"
                initial={{ x: 48, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 32, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
              >
                <header className="flex items-center gap-3 border-b border-border/70 px-4 py-4 sm:px-6">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Back to notification list"
                    onClick={backToNotificationList}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Notification
                  </h2>
                  <Button
                    className="ml-auto"
                    variant="ghost"
                    size="icon"
                    aria-label="Close notification details"
                    onClick={backToNotificationList}
                  >
                    <X className="size-4" />
                  </Button>
                </header>
                <div className="flex-1 overflow-y-auto px-4 pb-10 pt-4 sm:px-6">
                  {detail ? (
                    <DetailCard notification={detail} actions={false} />
                  ) : (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                      This notification is no longer available.
                    </p>
                  )}
                </div>
              </motion.section>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Drawer
        open={isMobile && notificationActionId !== null}
        onOpenChange={(open) => !open && setNotificationActionId(null)}
      >
        <DrawerContent
          overlayClassName="z-[105]"
          className="z-[110] max-h-[85dvh] overflow-y-auto rounded-t-3xl px-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          <DrawerHeader className="relative px-5 pb-4 pt-3 text-left">
            <DrawerTitle>Notification actions</DrawerTitle>
            <DrawerDescription>Manage this notification.</DrawerDescription>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close notification actions"
                className="absolute right-0 top-1"
              >
                <X className="size-4" />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          {actionNotification ? (
            <div className="w-full divide-y divide-border border-y border-border">
              <Button
                variant="ghost"
                className="h-14 w-full justify-start rounded-none px-5 shadow-none"
                onClick={() => {
                  setNotificationActionId(null);
                  setPending({
                    type: actionNotification.read ? "unread" : "read",
                    id: actionNotification.id,
                  });
                }}
              >
                <Check className="mr-2 size-4" />
                {actionNotification.read ? "Mark as unread" : "Mark as read"}
              </Button>
              <Button
                variant="ghost"
                className="h-14 w-full justify-start rounded-none px-5 shadow-none"
                onClick={() => {
                  setNotificationActionId(null);
                  setPending({
                    type: actionNotification.archived ? "unarchive" : "archive",
                    id: actionNotification.id,
                  });
                }}
              >
                <Archive className="mr-2 size-4" />
                {actionNotification.archived ? "Move to inbox" : "Archive notification"}
              </Button>
              <Button
                variant="ghost"
                className="h-14 w-full justify-start rounded-none px-5 text-destructive shadow-none hover:bg-destructive/5 hover:text-destructive"
                onClick={() => {
                  setNotificationActionId(null);
                  setPending({ type: "delete", id: actionNotification.id });
                }}
              >
                <Trash2 className="mr-2 size-4" /> Remove notification
              </Button>
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(next) => (next ? null : setPending(null))}
      >
        <AlertDialogContent className="z-[95]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.type === "clear"
                ? "Clear every notification?"
                : pending?.type === "emptyArchive"
                  ? "Empty the archive?"
                  : pending?.type === "delete"
                    ? "Delete this notification?"
                    : pending?.type === "archive"
                      ? "Archive this notification?"
                      : pending?.type === "unarchive"
                        ? "Move back to inbox?"
                        : pending?.type === "unread"
                          ? "Mark as unread?"
                          : "Mark as read?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.type === "clear"
                ? "This removes all inbox notifications from this device. It cannot be undone."
                : pending?.type === "emptyArchive"
                  ? "This permanently deletes everything in the archive. It cannot be undone."
                  : pending?.type === "delete"
                    ? "It will be removed from this device. It cannot be undone."
                    : "You can change this again at any time."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runPending}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Drawer open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <DrawerContent overlayClassName="z-[105]" className="z-[110] max-h-[85dvh]">
          <DrawerHeader className="border-b border-border pb-4 text-left">
            <DrawerTitle className="font-display text-xl">Filter notifications</DrawerTitle>
            <DrawerDescription>Choose which activity appears in your inbox.</DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {notificationFilters.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => {
                  setFilter(item.id);
                  resetVisibleCount();
                  setFilterSheetOpen(false);
                }}
                className={cn(
                  "flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors",
                  filter === item.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-secondary",
                )}
              >
                <span>{item.label}</span>
                {filter === item.id ? <Check className="size-4 shrink-0" /> : null}
              </button>
            ))}
          </div>
          {filter !== "all" ? (
            <div className="border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setFilter("all");
                  resetVisibleCount();
                  setFilterSheetOpen(false);
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}

function Group({
  label,
  items,
  onActivate,
  onOpenActions,
  onRequest,
}: {
  label: string;
  items: AppNotification[];
  onActivate: (n: AppNotification) => void;
  onOpenActions: (id: string) => void;
  onRequest: (action: PendingAction) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </h3>
      <div className="border-y border-border bg-background">
        <AnimatePresence initial={false}>
          {items.map((n) => (
            <Row
              key={n.id}
              notification={n}
              onActivate={onActivate}
              onOpenActions={onOpenActions}
              onRequest={onRequest}
            />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

function Row({
  notification: n,
  onActivate,
  onOpenActions,
  onRequest,
}: {
  notification: AppNotification;
  onActivate: (n: AppNotification) => void;
  onOpenActions: (id: string) => void;
  onRequest: (action: PendingAction) => void;
}) {
  const meta = kindMeta[n.kind];
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 34 }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.25}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (info.offset.x < -90) onRequest({ type: "delete", id: n.id });
        else if (info.offset.x > 90) onRequest({ type: n.read ? "unread" : "read", id: n.id });
      }}
      className={cn(
        "group relative border-b border-border last:border-b-0 transition-colors hover:bg-secondary/30",
        !n.read && "bg-primary/[0.07]",
      )}
    >
      <div className="flex min-h-20 items-center gap-2 px-4 py-4 sm:px-5">
        <button
          type="button"
          onClick={() => onActivate(n)}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          {n.actor?.username || n.actor?.photoUrl ? (
            <ProfileAvatar
              photoUrl={n.actor.photoUrl}
              initials={n.actor.username?.slice(0, 2) ?? "U"}
              className="size-14 shrink-0 border border-border/70 text-base uppercase"
            />
          ) : (
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full",
                meta.ring,
              )}
            >
              <Icon className={cn("size-5", meta.tint)} />
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-3">
              <span className="block min-w-0 flex-1 truncate text-base font-bold leading-snug text-foreground">
                {n.title}
              </span>
              <span className="shrink-0 text-sm font-medium text-muted-foreground">
                {timeAgo(n.createdAt)}
              </span>
            </span>
            {n.description ? (
              <span className="mt-1 block truncate text-sm text-muted-foreground">
                {n.description}
              </span>
            ) : null}
          </span>

          {!n.read ? (
            <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
          ) : null}
        </button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Notification actions for ${n.title}`}
          className="size-9 shrink-0 rounded-full"
          onClick={() => onOpenActions(n.id)}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </div>

      {!n.read ? (
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary" />
      ) : null}
    </motion.div>
  );
}

function DetailCard({
  notification: n,
  actions = true,
}: {
  notification: AppNotification;
  actions?: boolean;
}) {
  const meta = kindMeta[n.kind];
  const Icon = meta.icon;
  return (
    <article className="rounded-3xl border border-border bg-card/60 p-6 backdrop-blur">
      <span className={cn("inline-flex rounded-2xl p-3", meta.ring)}>
        <Icon className={cn("size-5", meta.tint)} />
      </span>
      <h3 className="mt-4 font-display text-xl font-semibold tracking-tight">{n.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</p>
      {actions ? (
        <div className="mt-6 flex gap-2">
          <Button variant="outline" size="sm" onClick={backToNotificationList}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button variant="ghost" size="sm" onClick={closeNotifications}>
            Close
          </Button>
        </div>
      ) : null}
    </article>
  );
}
