import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
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
  backToNotificationList,
  clearNotifications,
  closeNotifications,
  markAllRead,
  markRead,
  markUnread,
  openNotificationDetail,
  pruneExpired,
  removeNotification,
  useNotifications,
  useNotificationsOverlay,
  type AppNotification,
  type NotifyKind,
} from "@/lib/notifications-store";
import { cn } from "@/lib/utils";

const kindMeta: Record<NotifyKind, { icon: typeof Info; tint: string; ring: string }> = {
  success: { icon: CheckCircle2, tint: "text-emerald-400", ring: "bg-emerald-400/10" },
  error: { icon: XCircle, tint: "text-rose-400", ring: "bg-rose-400/10" },
  warning: { icon: AlertTriangle, tint: "text-amber-400", ring: "bg-amber-400/10" },
  info: { icon: Info, tint: "text-primary", ring: "bg-primary/10" },
};

function timeAgo(ts: number) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

type PendingAction =
  | { type: "delete"; id: string }
  | { type: "read"; id: string }
  | { type: "unread"; id: string }
  | { type: "clear" };

export function NotificationsOverlay() {
  const { open, view } = useNotificationsOverlay();
  const notifications = useNotifications();
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const unread = notifications.reduce((total, n) => total + (n.read ? 0 : 1), 0);

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
    for (const n of notifications) {
      (n.createdAt >= startOfToday.getTime() ? today : earlier).push(n);
    }
    return { today, earlier };
  }, [notifications]);

  const detail =
    view.name === "detail" ? notifications.find((n) => n.id === view.id) ?? null : null;

  function activate(n: AppNotification) {
    markRead(n.id);
    if (n.link?.href) {
      closeNotifications();
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
    if (pending.type === "clear") clearNotifications();
    setPending(null);
  }

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="notifications-overlay"
            className="pointer-events-none fixed inset-0 z-[70] flex flex-col pt-16 sm:pt-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
          >
            <motion.div
              className="pointer-events-auto absolute inset-0 top-16 bg-background/80 backdrop-blur-xl sm:top-0"
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
              className="pointer-events-auto relative flex h-full w-full flex-col outline-none sm:mx-auto sm:my-6 sm:h-[calc(100%-3rem)] sm:max-w-2xl sm:overflow-hidden sm:rounded-3xl sm:border sm:border-border sm:bg-card/70 sm:shadow-2xl"
              initial={{ y: 32, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
            >
              <header className="flex items-center gap-3 border-b border-border/70 px-4 py-4 sm:px-6">
                {view.name === "list" ? (
                  <div className="relative">
                    <span className="absolute inset-0 -z-10 rounded-2xl bg-primary/25 blur-xl" />
                    <div className="rounded-2xl border border-border bg-secondary/60 p-2.5">
                      <Bell className="size-4 text-primary" />
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Back to notifications"
                    onClick={backToNotificationList}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                )}

                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    {view.name === "list" ? "Notifications" : "Notification"}
                  </h2>
                  {view.name === "list" ? (
                    <p className="text-xs text-muted-foreground">
                      {unread > 0 ? `${unread} unread` : "You're all caught up"}
                    </p>
                  ) : null}
                </div>

                <div className="ml-auto flex items-center gap-1">
                  {view.name === "list" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={markAllRead}
                        disabled={unread === 0}
                      >
                        <CheckCheck className="size-4" />
                        <span className="hidden sm:inline">Mark all read</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Clear all notifications"
                        disabled={notifications.length === 0}
                        onClick={() => setPending({ type: "clear" })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close notifications"
                    onClick={closeNotifications}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto px-4 pb-10 pt-4 sm:px-6">
                <AnimatePresence mode="wait" initial={false}>
                  {view.name === "detail" ? (
                    <motion.div
                      key="detail"
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 24 }}
                      transition={{ duration: 0.2 }}
                    >
                      {detail ? (
                        <DetailCard notification={detail} />
                      ) : (
                        <p className="py-16 text-center text-sm text-muted-foreground">
                          This notification is no longer available.
                        </p>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="list"
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.2 }}
                    >
                      {notifications.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-border p-12 text-center">
                          <Bell className="mx-auto size-6 text-muted-foreground" />
                          <p className="mt-3 text-sm font-medium">You&apos;re all caught up</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Replies, mentions, followers and messages from Candid land here.
                            Everyday confirmations stay as quick toasts.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <Group
                            label="Today"
                            items={groups.today}
                            onActivate={activate}
                            onRequest={setPending}
                          />
                          <Group
                            label="Earlier"
                            items={groups.earlier}
                            onActivate={activate}
                            onRequest={setPending}
                          />
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AlertDialog open={pending !== null} onOpenChange={(next) => (next ? null : setPending(null))}>
        <AlertDialogContent className="z-[95]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.type === "clear"
                ? "Clear every notification?"
                : pending?.type === "delete"
                  ? "Delete this notification?"
                  : pending?.type === "unread"
                    ? "Mark as unread?"
                    : "Mark as read?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.type === "clear"
                ? "This removes all notifications from this device. It cannot be undone."
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
        else if (info.offset.x > 90)
          onRequest({ type: n.read ? "unread" : "read", id: n.id });
      }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur transition-colors hover:border-primary/40",
        !n.read && "border-primary/30 bg-primary/[0.06]",
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
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className={cn("mt-0.5 rounded-xl p-2", meta.ring)}>
          <Icon className={cn("size-4", meta.tint)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{n.title}</span>
            {!n.read ? <span className="size-1.5 rounded-full bg-primary" /> : null}
          </span>
          {n.description ? (
            <span className="mt-1 block text-xs text-muted-foreground">{n.description}</span>
          ) : null}
          <span className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            {timeAgo(n.createdAt)}
            {n.link ? (
              <span className="inline-flex items-center gap-0.5 text-primary">
                {n.link.label ?? "Open"} <ChevronRight className="size-3" />
              </span>
            ) : null}
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
              className="size-8 text-muted-foreground"
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
            <DropdownMenuItem onSelect={() => onRequest({ type: "delete", id: n.id })}>
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <span className="pointer-events-none absolute inset-y-0 left-0 hidden w-1 bg-primary/70 sm:block sm:opacity-0 sm:group-hover:opacity-100" />
    </motion.div>
  );
}

function DetailCard({ notification: n }: { notification: AppNotification }) {
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
      <div className="mt-6 flex gap-2">
        <Button variant="outline" size="sm" onClick={backToNotificationList}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button variant="ghost" size="sm" onClick={closeNotifications}>
          Close
        </Button>
      </div>
    </article>
  );
}
