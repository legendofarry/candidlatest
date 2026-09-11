import { useSyncExternalStore } from "react";

export type NotifyKind = "success" | "error" | "info" | "warning";

export type NotifyCategory = "system" | "social" | "action";

/** Where a notification should take the user when it is actionable. */
export type NotifyLink = { href: string; label?: string };

export type AppNotification = {
  id: string;
  kind: NotifyKind;
  title: string;
  description?: string | undefined;
  createdAt: number;
  read: boolean;
  category?: NotifyCategory;
  link?: NotifyLink | undefined;
  /** Epoch ms after which a one-time system notice is swept from storage. */
  expiresAt?: number | undefined;
  /** Collapses repeats of the same event inside a short window. */
  dedupeKey?: string | undefined;
};

export type BannerNotification = AppNotification & { duration: number };

/**
 * v2 deliberately abandons the v1 blob: v1 stored every transient toast, so
 * existing users would otherwise open an inbox full of "Report sent" rows.
 */
const STORAGE_KEY = "candid.notifications.v2";
const LEGACY_STORAGE_KEYS = ["candid.notifications.v1"];
/** Same event pushed twice inside this window collapses into one row. */
const DEDUPE_WINDOW_MS = 60_000;
const MAX_STORED = 60;
/** One-time system notices disappear this long after the user has read them. */
export const SYSTEM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type OverlayView = { name: "list" } | { name: "detail"; id: string };

let notifications: AppNotification[] = [];
let banners: BannerNotification[] = [];
let hydrated = false;
let overlayOpen = false;
let overlayView: OverlayView = { name: "list" };

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  hydrate();
  return () => listeners.delete(listener);
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    for (const legacy of LEGACY_STORAGE_KEYS) window.localStorage.removeItem(legacy);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppNotification[];
      if (Array.isArray(parsed)) {
        notifications = parsed.slice(0, MAX_STORED);
        pruneExpired();
        emit();
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_STORED)));
  } catch {
    /* storage full or unavailable */
  }
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Drops read one-time system notices whose TTL has elapsed. */
export function pruneExpired() {
  const now = Date.now();
  const next = notifications.filter((n) => !(n.expiresAt && n.expiresAt <= now));
  if (next.length !== notifications.length) {
    notifications = next;
    persist();
    return true;
  }
  return false;
}

export function openNotifications() {
  if (pruneExpired()) {
    /* swept on open */
  }
  overlayOpen = true;
  overlayView = { name: "list" };
  emit();
}

export function closeNotifications() {
  overlayOpen = false;
  overlayView = { name: "list" };
  emit();
}

export function openNotificationDetail(id: string) {
  overlayOpen = true;
  overlayView = { name: "detail", id };
  emit();
}

export function backToNotificationList() {
  overlayView = { name: "list" };
  emit();
}

/**
 * The bell never disables: on a nested view it steps back to the list first,
 * on the list it closes the overlay, and when closed it opens it.
 */
export function toggleNotifications() {
  if (!overlayOpen) {
    openNotifications();
    return;
  }
  if (overlayView.name !== "list") {
    backToNotificationList();
    return;
  }
  closeNotifications();
}

export function useNotificationsOverlay() {
  const open = useSyncExternalStore(
    subscribe,
    () => overlayOpen,
    () => false,
  );
  const view = useSyncExternalStore(
    subscribe,
    () => overlayView,
    () => LIST_VIEW,
  );
  return { open, view };
}

export function dismissBanner(id: string) {
  banners = banners.filter((b) => b.id !== id);
  emit();
}

export type PushOptions = {
  description?: string;
  duration?: number;
  /** Skip the on-screen toast (inbox-only delivery). */
  silent?: boolean;
  /**
   * Store in the notifications inbox. Defaults to FALSE: action feedback is
   * transient. Only durable, "you'd be sad to miss it" events opt in — use the
   * `inbox` helper rather than passing this by hand.
   */
  persist?: boolean;
  category?: NotifyCategory;
  link?: NotifyLink;
  dedupeKey?: string;
};

export function pushNotification(kind: NotifyKind, title: string, options?: PushOptions) {
  const item: AppNotification = {
    id: newId(),
    kind,
    title,
    description: options?.description,
    createdAt: Date.now(),
    read: false,
    category: options?.category ?? (options?.link ? "action" : "system"),
    link: options?.link,
    dedupeKey: options?.dedupeKey,
  };

  if (options?.persist === true) {
    const key = options?.dedupeKey ?? `${kind}:${title}`;
    const now = Date.now();
    const duplicate = notifications.find(
      (n) => (n.dedupeKey ?? `${n.kind}:${n.title}`) === key && now - n.createdAt < DEDUPE_WINDOW_MS,
    );
    if (duplicate) {
      notifications = [item, ...notifications.filter((n) => n.id !== duplicate.id)].slice(0, MAX_STORED);
    } else {
      notifications = [item, ...notifications].slice(0, MAX_STORED);
    }
    persist();
  }

  if (!options?.silent) {
    banners = [{ ...item, duration: options?.duration ?? (kind === "error" ? 6500 : 4500) }, ...banners].slice(0, 3);
  }

  emit();
  return item.id;
}

/** Transient action feedback. Never stored, never badges the bell. */
export const notify = {
  success: (title: string, options?: { description?: string; duration?: number }) =>
    pushNotification("success", title, options),
  error: (title: string, options?: { description?: string; duration?: number }) =>
    pushNotification("error", title, options),
  info: (title: string, options?: { description?: string; duration?: number }) =>
    pushNotification("info", title, options),
  warning: (title: string, options?: { description?: string; duration?: number }) =>
    pushNotification("warning", title, options),
};

type InboxOptions = Omit<PushOptions, "persist">;

/** Durable notification: stored, badged, and shown in the overlay. */
export function pushInboxNotification(kind: NotifyKind, title: string, options?: InboxOptions) {
  return pushNotification(kind, title, { ...options, persist: true });
}

export const inbox = {
  success: (title: string, options?: InboxOptions) => pushInboxNotification("success", title, options),
  error: (title: string, options?: InboxOptions) => pushInboxNotification("error", title, options),
  info: (title: string, options?: InboxOptions) => pushInboxNotification("info", title, options),
  warning: (title: string, options?: InboxOptions) => pushInboxNotification("warning", title, options),
};

function withReadStamp(n: AppNotification): AppNotification {
  const category = n.category ?? "system";
  return {
    ...n,
    read: true,
    expiresAt:
      category === "system" && !n.link ? (n.expiresAt ?? Date.now() + SYSTEM_TTL_MS) : n.expiresAt,
  };
}

export function markUnread(id: string) {
  notifications = notifications.map((n) =>
    n.id === id ? { ...n, read: false, expiresAt: undefined } : n,
  );
  persist();
  emit();
}

export function markAllRead() {
  notifications = notifications.map((n) => (n.read ? n : withReadStamp(n)));
  persist();
  emit();
}

export function markRead(id: string) {
  notifications = notifications.map((n) => (n.id === id ? withReadStamp(n) : n));
  persist();
  emit();
}

export function removeNotification(id: string) {
  notifications = notifications.filter((n) => n.id !== id);
  persist();
  emit();
}

export function clearNotifications() {
  notifications = [];
  persist();
  emit();
}

const EMPTY: AppNotification[] = [];
const LIST_VIEW: OverlayView = { name: "list" };
const EMPTY_BANNERS: BannerNotification[] = [];

export function useNotifications() {
  return useSyncExternalStore(
    subscribe,
    () => notifications,
    () => EMPTY,
  );
}

export function useBanners() {
  return useSyncExternalStore(
    subscribe,
    () => banners,
    () => EMPTY_BANNERS,
  );
}

export function useUnreadCount() {
  return useSyncExternalStore(
    subscribe,
    () => notifications.reduce((total, n) => total + (n.read ? 0 : 1), 0),
    () => 0,
  );
}
