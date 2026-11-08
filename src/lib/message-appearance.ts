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
const snapshots = new Map<string, MessageAppearance>();
const loadedKeys = new Set<string>();
const savedKeys = new Set<string>();

function isChoice<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}

function normalizeAppearance(value: unknown): MessageAppearance {
  if (!value || typeof value !== "object") return DEFAULT_MESSAGE_APPEARANCE;
  const saved = value as Partial<MessageAppearance>;
  return {
    preset: isChoice(saved.preset, APPEARANCE_PRESETS)
      ? saved.preset
      : DEFAULT_MESSAGE_APPEARANCE.preset,
    wallpaper: isChoice(saved.wallpaper, ["plain", "solid", "gradient", "doodles"])
      ? saved.wallpaper
      : DEFAULT_MESSAGE_APPEARANCE.wallpaper,
    wallpaperColor:
      typeof saved.wallpaperColor === "string" && /^#[\da-f]{6}$/i.test(saved.wallpaperColor)
        ? saved.wallpaperColor
        : DEFAULT_MESSAGE_APPEARANCE.wallpaperColor,
    gradient:
      typeof saved.gradient === "number" && Number.isInteger(saved.gradient)
        ? Math.max(0, Math.min(2, saved.gradient))
        : DEFAULT_MESSAGE_APPEARANCE.gradient,
    doodle: isChoice(saved.doodle, ["waves", "leaves", "circles"])
      ? saved.doodle
      : DEFAULT_MESSAGE_APPEARANCE.doodle,
    bubbleColor:
      typeof saved.bubbleColor === "string" && /^#[\da-f]{6}$/i.test(saved.bubbleColor)
        ? saved.bubbleColor
        : DEFAULT_MESSAGE_APPEARANCE.bubbleColor,
    patternIntensity: isChoice(saved.patternIntensity, ["off", "subtle", "more"])
      ? saved.patternIntensity
      : DEFAULT_MESSAGE_APPEARANCE.patternIntensity,
    bubbleShape: isChoice(saved.bubbleShape, ["standard", "soft"])
      ? saved.bubbleShape
      : DEFAULT_MESSAGE_APPEARANCE.bubbleShape,
  };
}

function storageKey(userId: string | null) {
  return `${STORAGE_PREFIX}${userId ?? "guest"}`;
}

function getSnapshot(userId: string | null) {
  const key = storageKey(userId);
  const cached = snapshots.get(key);
  if (cached) return cached;

  let appearance = DEFAULT_MESSAGE_APPEARANCE;
  if (typeof window !== "undefined") {
    loadedKeys.add(key);
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        appearance = normalizeAppearance(JSON.parse(saved));
        savedKeys.add(key);
      }
    } catch (error) {
      console.warn("[messageAppearance] Could not read appearance preferences", error);
    }
  }
  snapshots.set(key, appearance);
  return appearance;
}

function notifyListeners(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

function subscribe(userId: string | null, listener: () => void) {
  const key = storageKey(userId);
  const subscribers = listeners.get(key) ?? new Set<() => void>();
  subscribers.add(listener);
  listeners.set(key, subscribers);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    try {
      snapshots.set(key, normalizeAppearance(event.newValue ? JSON.parse(event.newValue) : null));
      loadedKeys.add(key);
      if (event.newValue) savedKeys.add(key);
      else savedKeys.delete(key);
    } catch (error) {
      console.warn("[messageAppearance] Could not read updated appearance preferences", error);
      snapshots.set(key, DEFAULT_MESSAGE_APPEARANCE);
    }
    notifyListeners(key);
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    subscribers.delete(listener);
    window.removeEventListener("storage", handleStorage);
    if (subscribers.size === 0) listeners.delete(key);
  };
}

export function updateMessageAppearance(
  userId: string | null,
  update: Partial<MessageAppearance> | MessageAppearance,
) {
  const key = storageKey(userId);
  const appearance = normalizeAppearance({ ...getSnapshot(userId), ...update });
  snapshots.set(key, appearance);
  savedKeys.add(key);
  try {
    window.localStorage.setItem(key, JSON.stringify(appearance));
  } catch (error) {
    console.warn("[messageAppearance] Could not save appearance preferences", error);
  }
  notifyListeners(key);
}

export function useMessageAppearance(
  userId: string | null,
  legacyTheme?: "default" | "midnight" | "forest" | "ocean" | "sunset",
) {
  const subscribeToUser = useCallback(
    (listener: () => void) => subscribe(userId, listener),
    [userId],
  );
  const getUserSnapshot = useCallback(() => getSnapshot(userId), [userId]);
  const appearance = useSyncExternalStore(
    subscribeToUser,
    getUserSnapshot,
    () => DEFAULT_MESSAGE_APPEARANCE,
  );
  useEffect(() => {
    if (!userId || !legacyTheme) return;
    const key = storageKey(userId);
    if (!loadedKeys.has(key)) getSnapshot(userId);
    if (savedKeys.has(key)) return;
    const preset: AppearancePreset = legacyTheme === "forest" ? "matcha" : legacyTheme;
    const details = APPEARANCE_PALETTES[preset];
    updateMessageAppearance(userId, {
      ...DEFAULT_MESSAGE_APPEARANCE,
      preset,
      wallpaper: details.wallpaper,
      wallpaperColor: details.surface,
      bubbleColor: details.outgoing,
    });
  }, [legacyTheme, userId]);
  return appearance;
}
