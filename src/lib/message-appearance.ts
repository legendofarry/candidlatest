import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  DEFAULT_MESSAGE_APPEARANCE,
  MAX_CHAT_OVERRIDES,
  chooseNewer,
  defaultPrefs,
  effectiveLook,
  hasOverride,
  normalizePrefs,
  type ChatBehavior,
  type ChatPrefs,
  type MessageAppearance,
} from "./chat-prefs-model.ts";

export * from "./chat-prefs-model.ts";

const STORAGE_PREFIX = "candid_chat_prefs:v2:";
const LEGACY_PREFIX = "candid_message_appearance:";
const listeners = new Map<string, Set<() => void>>();
const snapshots = new Map<string, ChatPrefs>();
const pendingPush = new Map<string, boolean>();

function key(userId: string | null) {
  return `${STORAGE_PREFIX}${userId ?? "guest"}`;
}

function read(userId: string | null): ChatPrefs {
  const storageKey = key(userId);
  const cached = snapshots.get(storageKey);
  if (cached) return cached;

  let prefs = defaultPrefs();
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        prefs = normalizePrefs(JSON.parse(saved));
      } else {
        const legacy = window.localStorage.getItem(`${LEGACY_PREFIX}${userId ?? "guest"}`);
        if (legacy) prefs = normalizePrefs(JSON.parse(legacy));
      }
    } catch (error) {
      console.warn("[chatPrefs] Could not read saved preferences", error);
    }
  }
  snapshots.set(storageKey, prefs);
  return prefs;
}

function notify(userId: string | null) {
  listeners.get(key(userId))?.forEach((listener) => listener());
}

function write(userId: string | null, prefs: ChatPrefs, { push }: { push: boolean }) {
  const storageKey = key(userId);
  snapshots.set(storageKey, prefs);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(prefs));
  } catch (error) {
    console.warn("[chatPrefs] Could not save preferences on this device", error);
  }
  if (push) pendingPush.set(storageKey, true);
  notify(userId);
}

function change(userId: string | null, edit: (prefs: ChatPrefs) => ChatPrefs) {
  const next = edit(read(userId));
  write(userId, { ...next, updatedAt: Math.max(Date.now(), next.updatedAt + 1) }, { push: true });
}

export function updateChatLook(
  userId: string | null,
  partial: Partial<MessageAppearance>,
  conversationId?: string | null,
) {
  change(userId, (prefs) => {
    if (!conversationId) return { ...prefs, look: { ...prefs.look, ...partial } };
    const chats = {
      ...prefs.chats,
      [conversationId]: { ...prefs.chats[conversationId], ...partial },
    };
    const ids = Object.keys(chats);
    if (ids.length > MAX_CHAT_OVERRIDES) delete chats[ids[0]!];
    return { ...prefs, chats };
  });
}

export function resetChatLook(userId: string | null, conversationId?: string | null) {
  change(userId, (prefs) => {
    if (!conversationId) return { ...prefs, look: DEFAULT_MESSAGE_APPEARANCE };
    const chats = { ...prefs.chats };
    delete chats[conversationId];
    return { ...prefs, chats };
  });
}

export function updateChatBehavior(userId: string | null, partial: Partial<ChatBehavior>) {
  change(userId, (prefs) => ({ ...prefs, behavior: { ...prefs.behavior, ...partial } }));
}

function subscribe(userId: string | null, listener: () => void) {
  const storageKey = key(userId);
  const set = listeners.get(storageKey) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(storageKey, set);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey) return;
    try {
      snapshots.set(storageKey, normalizePrefs(event.newValue ? JSON.parse(event.newValue) : null));
    } catch {
      snapshots.set(storageKey, defaultPrefs());
    }
    notify(userId);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    set.delete(listener);
    window.removeEventListener("storage", onStorage);
    if (set.size === 0) listeners.delete(storageKey);
  };
}

export function useChatPrefs(userId: string | null): ChatPrefs {
  const subscribeToPrefs = useCallback(
    (listener: () => void) => subscribe(userId, listener),
    [userId],
  );
  const getPrefs = useCallback(() => read(userId), [userId]);
  return useSyncExternalStore(subscribeToPrefs, getPrefs, defaultPrefs);
}

/** The look and behaviour a conversation should render with. */
export function useChatLook(userId: string | null, conversationId?: string | null) {
  const prefs = useChatPrefs(userId);
  return {
    prefs,
    look: effectiveLook(prefs, conversationId),
    behavior: prefs.behavior,
    overridden: hasOverride(prefs, conversationId),
  };
}

type RemotePrefs = { data: string | null; updated_at: number } | null | undefined;

/** Loads the account copy once and syncs newer local edits back to the account. */
export function useChatPrefsSync(
  userId: string | null,
  api: {
    load: () => Promise<RemotePrefs>;
    save: (payload: { data: string; updated_at: number }) => Promise<unknown>;
  },
) {
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const remote = await apiRef.current.load();
        if (cancelled || !remote?.data) return;
        const remotePrefs = normalizePrefs(JSON.parse(remote.data));
        const local = read(userId);
        const remoteTimestamp = Math.max(remotePrefs.updatedAt, remote.updated_at);
        const winner = chooseNewer(local, { ...remotePrefs, updatedAt: remoteTimestamp });
        if (winner === "remote") {
          write(userId, { ...remotePrefs, updatedAt: remoteTimestamp }, { push: false });
        } else if (winner === "local" && local.updatedAt > 0) {
          pendingPush.set(key(userId), true);
        }
      } catch (error) {
        console.warn("[chatPrefs] Could not load account preferences", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const prefs = useChatPrefs(userId);
  useEffect(() => {
    if (!userId || !pendingPush.get(key(userId))) return;
    const timer = window.setTimeout(() => {
      pendingPush.delete(key(userId));
      const current = read(userId);
      void apiRef.current
        .save({ data: JSON.stringify(current), updated_at: current.updatedAt })
        .catch((error) => {
          pendingPush.set(key(userId), true);
          console.warn("[chatPrefs] Could not save to your account", error);
        });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [prefs, userId]);
}
