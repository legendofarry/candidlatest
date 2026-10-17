import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Info,
  MailOpen,
  MoreVertical,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  type NotifyKind,
} from "@/lib/notifications-store";
import { cn, formatCount } from "@/lib/utils";
import { openMessagePanel } from "@/lib/message-panel-state";
import { syncMyNotifications } from "@/lib/notification-sync.functions";
import { useAuth } from "@/hooks/useAuth";
import { useAutoCollapsingCount } from "@/hooks/use-auto-collapsing-count";
import { requiresEmailVerification } from "@/lib/email-verification";

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

export function NotificationsOverlay() {
  const { open, view } = useNotificationsOverlay();
  const all = useNotifications();
  const { user } = useAuth();
  const fetchNotificationPage = useServerFn(syncMyNotifications);
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [tab, setTab] = useState<"inbox" | "archive">("inbox");
  const { visibleCount, expandBy, resetVisibleCount } = useAutoCollapsingCount(20);
  const panelRef = useRef<HTMLDivElement | null>(null);

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
    for (const n of notifications.slice(0, visibleCount)) {
      (n.createdAt >= startOfToday.getTime() ? today : earlier).push(n);
    }
    return { today, earlier };
  }, [notifications, visibleCount]);

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

  function renderNotificationList() {
    return notifications.length === 0 ? (
      <div className="rounded-3xl border border-dashed border-border p-12 text-center">
        <Bell className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">
          {tab === "archive" ? "Archive is empty" : "You're all caught up"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {tab === "archive"
            ? "Archived notifications land here. You can restore or delete them."
            : "Replies, mentions, followers and messages from Candid land here. Everyday confirmations stay as quick toasts."}
        </p>
      </div>
    ) : (
      <div className="space-y-6">
        <Group label="Today" items={groups.today} onActivate={activate} onRequest={setPending} />
        <Group
          label="Earlier"
          items={groups.earlier}
          onActivate={activate}
          onRequest={setPending}
        />
        {notifications.length > visibleCount || serverPages.hasNextPage ? (
          <div className="flex flex-col items-center gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              Showing {formatCount(visibleCount)} of {formatCount(notifications.length)}{" "}
              notifications
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={serverPages.isFetchingNextPage}
              onClick={(event) => {
                if (visibleCount < notifications.length) {
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
                : visibleCount < notifications.length
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
      <div className="flex gap-2 border-b border-border bg-background px-4 py-3 sm:px-6">
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
              "inline-flex min-h-12 items-center gap-1.5 rounded-full border-2 px-5 text-sm font-semibold transition-colors",
              tab === item.key && "border-foreground bg-foreground text-background",
              tab !== item.key && "border-border bg-card text-foreground hover:bg-secondary/60",
            )}
          >
            {item.label}
            {item.count > 0 ? (
              <span
                className={cn(
                  "ml-1 flex size-7 items-center justify-center rounded-full text-xs font-bold",
                  tab === item.key
                    ? "bg-primary text-primary-foreground"
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
                {view.name === "list" ? (
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Bell className="size-6" />
                  </div>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Back to notifications"
                      className="!size-12 rounded-full border-2 xl:hidden"
                      onClick={backToNotificationList}
                    >
                      <ArrowLeft className="size-4" />
                    </Button>
                    <div className="hidden size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground xl:flex">
                      <Bell className="size-6" />
                    </div>
                  </>
                )}

                <div className="min-w-0">
                  <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    <span className={view.name === "detail" ? "xl:hidden" : ""}>
                      {view.name === "list" ? "Notifications" : "Notification"}
                    </span>
                    {view.name === "detail" ? (
                      <span className="hidden xl:inline">Notifications</span>
                    ) : null}
                  </h2>
                  {view.name === "list" || view.name === "detail" ? (
                    <p
                      className={cn(
                        "text-sm font-medium text-muted-foreground",
                        view.name === "detail" && "hidden xl:block",
                      )}
                    >
                      {unread > 0 ? `${unread} unread` : "You're all caught up"}
                    </p>
                  ) : null}
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
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Close notifications"
                    className="!size-10 rounded-full border-2 bg-foreground text-background hover:bg-foreground/90 hover:text-background sm:!size-12"
                    onClick={closeNotifications}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </header>

              {view.name === "list" ? (
                renderTabs()
              ) : (
                <div className="hidden xl:block">{renderTabs()}</div>
              )}

              {view.name === "list" ? (
                <div className="flex-1 overflow-y-auto bg-secondary/30 px-4 pb-10 pt-5 sm:px-6">
                  {renderNotificationList()}
                </div>
              ) : (
                <>
                  <div className="hidden flex-1 overflow-y-auto bg-secondary/30 px-4 pb-10 pt-5 sm:px-6 xl:block">
                    {renderNotificationList()}
                  </div>
                  <div className="flex-1 overflow-y-auto bg-secondary/30 px-4 pb-10 pt-5 sm:px-6 xl:hidden">
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
    </>
  );
}

function Group({
  label,
  items,
  onActivate,
  onRequest,
}: {
  label: string;
  items: AppNotification[];
  onActivate: (n: AppNotification) => void;
  onRequest: (action: PendingAction) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </h3>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map((n) => (
            <Row key={n.id} notification={n} onActivate={onActivate} onRequest={onRequest} />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

function Row({
  notification: n,
  onActivate,
  onRequest,
}: {
  notification: AppNotification;
  onActivate: (n: AppNotification) => void;
  onRequest: (action: PendingAction) => void;
}) {
  const meta = kindMeta[n.kind];
  const Icon = meta.icon;
  const [menuOpen, setMenuOpen] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startHold() {
    holdTimer.current = setTimeout(() => setMenuOpen(true), 480);
  }
  function cancelHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

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
        "group relative overflow-hidden rounded-3xl border-2 border-border bg-card transition-colors hover:border-primary/40",
        !n.read && "border-primary/25 bg-primary/[0.08]",
      )}
    >
      <button
        type="button"
        onClick={() => onActivate(n)}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        className="flex min-h-32 w-full items-start gap-3 p-4 pr-12 text-left sm:gap-4 sm:p-5 sm:pr-14"
      >
        <span className={cn("mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-full", meta.ring)}>
          <Icon className={cn("size-6", meta.tint)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3 pr-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="line-clamp-2 text-base font-bold leading-snug sm:text-lg">{n.title}</span>
              {!n.read ? <span className="size-2 shrink-0 rounded-full bg-primary" /> : null}
            </span>
            <span className="shrink-0 pt-0.5 text-sm font-semibold text-muted-foreground">
              {timeAgo(n.createdAt)}
            </span>
          </span>
          {n.description ? (
            <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">{n.description}</span>
          ) : null}
          <span className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm">
            {n.link?.label ?? "Open"} <ChevronRight className="size-4" />
          </span>
        </span>
      </button>

      <div className="absolute right-2 top-3">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notification options"
              className="size-9 rounded-full bg-background/75 text-muted-foreground"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[95] w-48">
            <DropdownMenuItem
              onSelect={() => onRequest({ type: n.read ? "unread" : "read", id: n.id })}
            >
              <MailOpen className="size-4" /> Mark as {n.read ? "unread" : "read"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onRequest({ type: n.archived ? "unarchive" : "archive", id: n.id })}
            >
              {n.archived ? (
                <>
                  <ArchiveRestore className="size-4" /> Move to inbox
                </>
              ) : (
                <>
                  <Archive className="size-4" /> Archive
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRequest({ type: "delete", id: n.id })}>
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!n.read ? (
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-primary" />
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
      {n.description ? (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{n.description}</p>
      ) : null}
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
