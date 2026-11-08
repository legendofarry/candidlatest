import type { CSSProperties } from "react";
import {
  WALLPAPER_GRADIENTS,
  WALLPAPER_PACKS,
  type WallpaperKind,
  type WallpaperPackId,
  type WallpaperSettings,
} from "./chat-wallpapers.ts";

/* ───────────── Look: everything that decides how a chat is drawn ───────────── */

export const APPEARANCE_PRESETS = [
  "default",
  "cloud",
  "midnight",
  "graphite",
  "matcha",
  "sunset",
  "ocean",
  "rose",
  "lavender",
  "paper-doodles",
] as const;
export type AppearancePreset = (typeof APPEARANCE_PRESETS)[number];
export type BubbleShape = "standard" | "soft" | "sharp";
export type TextSize = "small" | "medium" | "large";
export type Density = "comfortable" | "compact";

export type MessageAppearance = WallpaperSettings & {
  preset: AppearancePreset;
  bubbleColor: string;
  bubbleShape: BubbleShape;
  bubbleTail: boolean;
  textSize: TextSize;
};

export type ChatBehavior = {
  sendOnEnter: boolean;
  density: Density;
  haptics: boolean;
};

/** Everything that follows a member across devices. */
export type ChatPrefs = {
  version: 2;
  /** Epoch ms of the last change; the newest copy (device or server) wins. */
  updatedAt: number;
  look: MessageAppearance;
  behavior: ChatBehavior;
  /** Per-conversation overrides of the default look. */
  chats: Record<string, Partial<MessageAppearance>>;
};

export const DEFAULT_MESSAGE_APPEARANCE: MessageAppearance = {
  preset: "default",
  wallpaper: "pattern",
  pack: "messenger",
  wallpaperColor: "#eee3cf",
  gradient: 0,
  patternOpacity: 45,
  patternScale: 100,
  patternBase: null,
  dim: 0,
  bubbleColor: "#c96f4a",
  bubbleShape: "standard",
  bubbleTail: true,
  textSize: "medium",
};

export const DEFAULT_CHAT_BEHAVIOR: ChatBehavior = {
  sendOnEnter: true,
  density: "comfortable",
  haptics: true,
};

export const PREMIUM_PRESETS: ReadonlySet<AppearancePreset> = new Set(["matcha", "sunset", "ocean"]);

type Palette = {
  label: string;
  surface: string;
  ink: string;
  incoming: string;
  outgoing: string;
  border: string;
  dark: boolean;
  wallpaper: WallpaperKind;
  pack: WallpaperPackId;
};

export const APPEARANCE_PALETTES: Record<AppearancePreset, Palette> = {
  default: { label: "Candid", surface: "#f7f4ed", ink: "#292722", incoming: "#ffffff", outgoing: "#c96f4a", border: "#e5ded2", dark: false, wallpaper: "pattern", pack: "messenger" },
  cloud: { label: "Cloud", surface: "#f2efe8", ink: "#292722", incoming: "#fffdf9", outgoing: "#a68a62", border: "#e7dfd1", dark: false, wallpaper: "plain", pack: "dots" },
  midnight: { label: "Midnight", surface: "#191c1f", ink: "#f1f3f5", incoming: "#262b30", outgoing: "#3c617c", border: "#33383d", dark: true, wallpaper: "pattern", pack: "geometric" },
  graphite: { label: "Graphite", surface: "#121212", ink: "#ececec", incoming: "#222222", outgoing: "#9bd13f", border: "#2e2e2e", dark: true, wallpaper: "pattern", pack: "kenya-work" },
  matcha: { label: "Matcha", surface: "#edf0e3", ink: "#31372b", incoming: "#f8f9f2", outgoing: "#a7b58d", border: "#dce2cd", dark: false, wallpaper: "pattern", pack: "nature" },
  sunset: { label: "Sunset", surface: "#fbefe4", ink: "#44342b", incoming: "#fff8f1", outgoing: "#f6b486", border: "#f0ddca", dark: false, wallpaper: "pattern", pack: "friends" },
  ocean: { label: "Ocean", surface: "#eaf2f5", ink: "#263943", incoming: "#f7fbfc", outgoing: "#3174a4", border: "#d5e4eb", dark: false, wallpaper: "pattern", pack: "nature" },
  rose: { label: "Rose", surface: "#fbeef0", ink: "#42262d", incoming: "#fff8f9", outgoing: "#d9607a", border: "#f0d9de", dark: false, wallpaper: "pattern", pack: "friends" },
  lavender: { label: "Lavender", surface: "#efeaf8", ink: "#2f2a44", incoming: "#faf8ff", outgoing: "#7b66c7", border: "#ddd5ee", dark: false, wallpaper: "pattern", pack: "geometric" },
  "paper-doodles": { label: "Paper", surface: "#f4f0e9", ink: "#302c25", incoming: "#ffffff", outgoing: "#c96f4a", border: "#e7ded0", dark: false, wallpaper: "pattern", pack: "kenya-work" },
};

export const BUBBLE_COLORS = [
  "#c96f4a", "#3c617c", "#3174a4", "#617c55", "#7b66c7", "#d9607a",
  "#3e454f", "#e4a0a1", "#dfc9a8", "#a8c9de", "#9bd13f", "#25282b",
] as const;

/** Look values a preset decides. Applying one keeps the member's shape / text-size choices. */
export function presetLook(preset: AppearancePreset): Partial<MessageAppearance> {
  const palette = APPEARANCE_PALETTES[preset];
  return {
    preset,
    wallpaper: palette.wallpaper,
    pack: palette.pack,
    wallpaperColor: palette.surface,
    patternBase: null,
    gradient: 0,
    dim: 0,
    patternOpacity: palette.dark ? 55 : 45,
    patternScale: 100,
    bubbleColor: palette.outgoing,
  };
}

function hexInk(hex: string) {
  const rgb = hex.match(/[\da-f]{2}/gi)?.slice(0, 3).map((part) => parseInt(part, 16)) ?? [0, 0, 0];
  return (rgb[0]! * 299 + rgb[1]! * 587 + rgb[2]! * 114) / 1000 > 150 ? "#202124" : "#ffffff";
}

export function getMessageAppearanceStyle(look: MessageAppearance): CSSProperties {
  const palette = APPEARANCE_PALETTES[look.preset];
  const usesAppTheme = look.preset === "default";
  return {
    // "Candid" follows the site's live light/dark tokens; other themes stay fixed so a chosen look is predictable.
    "--chat-surface": usesAppTheme ? "var(--background)" : palette.surface,
    "--chat-ink": usesAppTheme ? "var(--foreground)" : palette.ink,
    "--chat-incoming": usesAppTheme ? "var(--card)" : palette.incoming,
    "--chat-incoming-ink": usesAppTheme ? "var(--card-foreground)" : palette.dark ? "#f1f3f5" : "#292722",
    "--chat-outgoing": usesAppTheme ? "var(--primary)" : look.bubbleColor,
    "--chat-outgoing-ink": usesAppTheme ? "var(--primary-foreground)" : hexInk(look.bubbleColor),
    "--chat-border": usesAppTheme ? "var(--border)" : palette.border,
  } as CSSProperties;
}

export function getChatDataAttributes(look: MessageAppearance, behavior: ChatBehavior) {
  return {
    "data-appearance-preset": look.preset,
    "data-bubble-shape": look.bubbleShape,
    "data-bubble-tail": look.bubbleTail ? "on" : "off",
    "data-text-size": look.textSize,
    "data-density": behavior.density,
  } as const;
}

/* ───────────── Parsing & migration (pure, tested) ───────────── */

function isChoice<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && (choices as readonly string[]).includes(value);
}
const HEX = /^#[\da-f]{6}$/i;
function int(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

/** Reads a (possibly partial or legacy) look; only valid fields survive. */
export function parseLook(value: unknown): Partial<MessageAppearance> {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const out: Partial<MessageAppearance> = {};
  if (isChoice(v["preset"], APPEARANCE_PRESETS)) out.preset = v["preset"];
  // v1 used "doodles" + a doodle style; map it to the new pattern packs.
  if (v["wallpaper"] === "doodles") {
    out.wallpaper = "pattern";
    out.pack = v["doodle"] === "circles" ? "geometric" : "nature";
  } else if (isChoice(v["wallpaper"], ["plain", "solid", "gradient", "pattern"] as const)) {
    out.wallpaper = v["wallpaper"];
  }
  if (isChoice(v["pack"], WALLPAPER_PACKS)) out.pack = v["pack"];
  if (typeof v["wallpaperColor"] === "string" && HEX.test(v["wallpaperColor"])) out.wallpaperColor = v["wallpaperColor"];
  if (typeof v["gradient"] === "number") out.gradient = int(v["gradient"], 0, WALLPAPER_GRADIENTS.length - 1, 0);
  if (typeof v["patternOpacity"] === "number") out.patternOpacity = int(v["patternOpacity"], 0, 100, 45);
  else if (v["patternIntensity"] === "off") out.patternOpacity = 0;
  else if (v["patternIntensity"] === "more") out.patternOpacity = 70;
  else if (v["patternIntensity"] === "subtle") out.patternOpacity = 40;
  if (typeof v["patternScale"] === "number") out.patternScale = int(v["patternScale"], 50, 200, 100);
  if (v["patternBase"] === null) out.patternBase = null;
  else if (typeof v["patternBase"] === "string" && HEX.test(v["patternBase"])) out.patternBase = v["patternBase"];
  if (typeof v["dim"] === "number") out.dim = int(v["dim"], 0, 60, 0);
  if (typeof v["bubbleColor"] === "string" && HEX.test(v["bubbleColor"])) out.bubbleColor = v["bubbleColor"];
  if (isChoice(v["bubbleShape"], ["standard", "soft", "sharp"] as const)) out.bubbleShape = v["bubbleShape"];
  if (typeof v["bubbleTail"] === "boolean") out.bubbleTail = v["bubbleTail"];
  if (isChoice(v["textSize"], ["small", "medium", "large"] as const)) out.textSize = v["textSize"];
  return out;
}

function parseBehavior(value: unknown): ChatBehavior {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    sendOnEnter: typeof v["sendOnEnter"] === "boolean" ? v["sendOnEnter"] : DEFAULT_CHAT_BEHAVIOR.sendOnEnter,
    density: isChoice(v["density"], ["comfortable", "compact"] as const) ? v["density"] : DEFAULT_CHAT_BEHAVIOR.density,
    haptics: typeof v["haptics"] === "boolean" ? v["haptics"] : DEFAULT_CHAT_BEHAVIOR.haptics,
  };
}

export const MAX_CHAT_OVERRIDES = 100;

export function defaultPrefs(): ChatPrefs {
  return { version: 2, updatedAt: 0, look: DEFAULT_MESSAGE_APPEARANCE, behavior: DEFAULT_CHAT_BEHAVIOR, chats: {} };
}

/** Accepts v2 prefs, a v1 appearance object, or garbage, and always returns valid prefs. */
export function normalizePrefs(raw: unknown): ChatPrefs {
  if (!raw || typeof raw !== "object") return defaultPrefs();
  const v = raw as Record<string, unknown>;
  if (v["version"] === 2) {
    const chats: Record<string, Partial<MessageAppearance>> = {};
    if (v["chats"] && typeof v["chats"] === "object") {
      for (const [id, override] of Object.entries(v["chats"] as Record<string, unknown>).slice(0, MAX_CHAT_OVERRIDES)) {
        const parsed = parseLook(override);
        if (id.length > 0 && id.length <= 180 && Object.keys(parsed).length > 0) chats[id] = parsed;
      }
    }
    return {
      version: 2,
      updatedAt: typeof v["updatedAt"] === "number" && Number.isFinite(v["updatedAt"]) ? v["updatedAt"] : 0,
      look: { ...DEFAULT_MESSAGE_APPEARANCE, ...parseLook(v["look"]) },
      behavior: parseBehavior(v["behavior"]),
      chats,
    };
  }
  // v1: the whole object was the look.
  return { ...defaultPrefs(), look: { ...DEFAULT_MESSAGE_APPEARANCE, ...parseLook(raw) } };
}

/** The look a given conversation uses: the member's default plus any override for that chat. */
export function effectiveLook(prefs: ChatPrefs, conversationId?: string | null): MessageAppearance {
  const override = conversationId ? prefs.chats[conversationId] : undefined;
  return override ? { ...prefs.look, ...override } : prefs.look;
}

export function hasOverride(prefs: ChatPrefs, conversationId?: string | null) {
  return Boolean(conversationId && prefs.chats[conversationId] && Object.keys(prefs.chats[conversationId]!).length > 0);
}

/** Server copy wins only when it is strictly newer. */
export function chooseNewer(local: ChatPrefs, remote: ChatPrefs): "local" | "remote" | "same" {
  if (remote.updatedAt > local.updatedAt) return "remote";
  if (local.updatedAt > remote.updatedAt) return "local";
  return "same";
}

/** Premium themes fall back to the default for members without Premium. */
export function stripPremiumPresets(prefs: ChatPrefs): ChatPrefs {
  const safe = (look: Partial<MessageAppearance>) =>
    look.preset && PREMIUM_PRESETS.has(look.preset) ? { ...look, preset: "default" as const, bubbleColor: DEFAULT_MESSAGE_APPEARANCE.bubbleColor } : look;
  return {
    ...prefs,
    look: safe(prefs.look) as MessageAppearance,
    chats: Object.fromEntries(Object.entries(prefs.chats).map(([id, look]) => [id, safe(look)])),
  };
}

