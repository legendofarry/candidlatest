import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  DEFAULT_CHAT_BEHAVIOR,
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

/* ───────────── Store: instant local cache + background sync ───────────── */

const STORAGE_PREFIX = "candid_chat_prefs:v2:";
const LEGACY_PREFIX = "candid_message_appearance:";
import { useCallback, useEffect, useSyncExternalStore, type CSSProperties } from "react";

export const APPEARANCE_PRESETS = [
  "default",
  "cloud",
  "midnight",
  "matcha",
  "sunset",
  "ocean",
  "paper-doodles",
] as const;
export type AppearancePreset = (typeof APPEARANCE_PRESETS)[number];
export type WallpaperStyle = "plain" | "solid" | "gradient" | "doodles";
export type DoodleStyle = "waves" | "leaves" | "circles";
export type PatternIntensity = "off" | "subtle" | "more";
export type BubbleShape = "standard" | "soft";

export type MessageAppearance = {
  preset: AppearancePreset;
  wallpaper: WallpaperStyle;
  wallpaperColor: string;
  gradient: number;
  doodle: DoodleStyle;
  bubbleColor: string;
  patternIntensity: PatternIntensity;
  bubbleShape: BubbleShape;
};

export const DEFAULT_MESSAGE_APPEARANCE: MessageAppearance = {
  preset: "default",
  wallpaper: "doodles",
  wallpaperColor: "#191c1f",
  gradient: 0,
  doodle: "waves",
  bubbleColor: "#c96f4a",
  patternIntensity: "subtle",
  bubbleShape: "standard",
};

export const APPEARANCE_PALETTES = {
  default: {
    label: "Default",
    surface: "#f7f4ed",
    ink: "#292722",
    incoming: "#ffffff",
    outgoing: "#c96f4a",
    border: "#e5ded2",
    wallpaper: "doodles",
  },
  cloud: {
    label: "Cloud",
    surface: "#f2efe8",
    ink: "#292722",
    incoming: "#fffdf9",
    outgoing: "#a68a62",
    border: "#e7dfd1",
    wallpaper: "plain",
  },
  midnight: {
    label: "Midnight",
    surface: "#191c1f",
    ink: "#f1f3f5",
    incoming: "#262b30",
    outgoing: "#3c617c",
    border: "#33383d",
    wallpaper: "plain",
  },
  matcha: {
    label: "Matcha",
    surface: "#edf0e3",
    ink: "#31372b",
    incoming: "#f8f9f2",
    outgoing: "#a7b58d",
    border: "#dce2cd",
    wallpaper: "doodles",
  },
  sunset: {
    label: "Sunset",
    surface: "#fbefe4",
    ink: "#44342b",
    incoming: "#fff8f1",
    outgoing: "#f6b486",
    border: "#f0ddca",
    wallpaper: "plain",
  },
  ocean: {
    label: "Ocean",
    surface: "#eaf2f5",
    ink: "#263943",
    incoming: "#f7fbfc",
    outgoing: "#3174a4",
    border: "#d5e4eb",
    wallpaper: "plain",
  },
  "paper-doodles": {
    label: "Paper Doodles",
    surface: "#f4f0e9",
    ink: "#302c25",
    incoming: "#ffffff",
    outgoing: "#c96f4a",
    border: "#e7ded0",
    wallpaper: "doodles",
  },
} as const;

export const APPEARANCE_GRADIENTS = [
  "linear-gradient(135deg, #f3e7d8, #eadce4)",
  "linear-gradient(135deg, #e5e9f2, #dce5ee)",
  "linear-gradient(135deg, #e8eddf, #dce5dc)",
];

export function getMessageAppearanceStyle(appearance: MessageAppearance): CSSProperties {
  const preset = APPEARANCE_PALETTES[appearance.preset];
  const usesAppTheme = appearance.preset === "default";
  const rgb = appearance.bubbleColor
    .match(/[\da-f]{2}/gi)
    ?.slice(0, 3)
    .map((part) => parseInt(part, 16)) ?? [0, 0, 0];
  const outgoingInk =
    ((rgb[0] ?? 0) * 299 + (rgb[1] ?? 0) * 587 + (rgb[2] ?? 0) * 114) / 1000 > 150 ? "#202124" : "#ffffff";
  return {
    // The Default appearance follows the site's live light/dark tokens. Explicit
    // appearances remain fixed so a user's chosen chat look is predictable.
    "--chat-surface": usesAppTheme ? "var(--background)" : preset.surface,
    "--chat-ink": usesAppTheme ? "var(--foreground)" : preset.ink,
    "--chat-incoming": usesAppTheme ? "var(--card)" : preset.incoming,
    "--chat-incoming-ink": usesAppTheme
      ? "var(--card-foreground)"
      : preset.surface === "#191c1f" ? "#f1f3f5" : "#292722",
    "--chat-outgoing": usesAppTheme ? "var(--primary)" : appearance.bubbleColor,
    "--chat-outgoing-ink": usesAppTheme ? "var(--primary-foreground)" : outgoingInk,
    "--chat-border": usesAppTheme ? "var(--border)" : preset.border,
    "--chat-wallpaper-color": appearance.wallpaperColor,
    "--chat-gradient": APPEARANCE_GRADIENTS[appearance.gradient],
  } as CSSProperties;
}

const STORAGE_PREFIX = "candid_message_appearance:";
const listeners = new Map<string, Set<() => void>>();
const snapshots = new Map<string, ChatPrefs>();
const pendingPush = new Map<string, boolean>();

function key(userId: string | null) {
  return `${STORAGE_PREFIX}${userId ?? "guest"}`;
}

function read(userId: string | null): ChatPrefs {
  const cached = snapshots.get(key(userId));
  if (cached) return cached;
  let prefs = defaultPrefs();
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(key(userId));
      if (saved) prefs = normalizePrefs(JSON.parse(saved));
      else {
        const legacy = window.localStorage.getItem(`${LEGACY_PREFIX}${userId ?? "guest"}`);
        if (legacy) prefs = normalizePrefs(JSON.parse(legacy));
      }
    } catch (error) {
      console.warn("[chatPrefs] Could not read saved preferences", error);
    }
  }
  snapshots.set(key(userId), prefs);
  return prefs;
}

function notify(userId: string | null) {
  listeners.get(key(userId))?.forEach((listener) => listener());
}

function write(userId: string | null, prefs: ChatPrefs, { push }: { push: boolean }) {
  snapshots.set(key(userId), prefs);
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(prefs));
  } catch (error) {
    console.warn("[chatPrefs] Could not save preferences on this device", error);
  }
  if (push) pendingPush.set(key(userId), true);
  notify(userId);
}

function change(userId: string | null, edit: (prefs: ChatPrefs) => ChatPrefs) {
  const next = edit(read(userId));
  write(userId, { ...next, updatedAt: Math.max(Date.now(), next.updatedAt + 1) }, { push: true });
}

export function updateChatLook(userId: string | null, partial: Partial<MessageAppearance>, conversationId?: string | null) {
  change(userId, (prefs) => {
    if (!conversationId) return { ...prefs, look: { ...prefs.look, ...partial } };
    const chats = { ...prefs.chats, [conversationId]: { ...prefs.chats[conversationId], ...partial } };
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
  const k = key(userId);
  const set = listeners.get(k) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(k, set);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== k) return;
    try {
      snapshots.set(k, normalizePrefs(event.newValue ? JSON.parse(event.newValue) : null));
    } catch {
      snapshots.set(k, defaultPrefs());
    }
    notify(userId);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    set.delete(listener);
    window.removeEventListener("storage", onStorage);
    if (set.size === 0) listeners.delete(k);
  };
}

export function useChatPrefs(userId: string | null): ChatPrefs {
  const sub = useCallback((listener: () => void) => subscribe(userId, listener), [userId]);
  const get = useCallback(() => read(userId), [userId]);
  return useSyncExternalStore(sub, get, defaultPrefs);
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

/**
 * Keeps this device and the member's account in step: loads the account copy once,
 * adopts it if newer, and pushes local edits shortly after they happen.
 */
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
        const winner = chooseNewer(local, { ...remotePrefs, updatedAt: Math.max(remotePrefs.updatedAt, remote.updated_at) });
        if (winner === "remote") write(userId, remotePrefs, { push: false });
        else if (winner === "local" && local.updatedAt > 0) pendingPush.set(key(userId), true);
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
      void apiRef.current
        .save({ data: JSON.stringify(read(userId)), updated_at: read(userId).updatedAt })
        .catch((error) => {
          pendingPush.set(key(userId), true);
          console.warn("[chatPrefs] Could not save to your account", error);
        });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [prefs, userId]);
}
