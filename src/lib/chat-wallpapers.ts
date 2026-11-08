/**
 * Chat wallpaper engine. Doodle packs are tiled line-art (like Telegram / WhatsApp)
 * drawn as an SVG used as a CSS mask, so one tile can take any ink colour and
 * opacity. Everything here is pure so it can be tested without a browser.
 */

export const WALLPAPER_PACKS = [
  "kenya-work",
  "messenger",
  "friends",
  "nature",
  "geometric",
  "dots",
  "lines",
] as const;
export type WallpaperPackId = (typeof WALLPAPER_PACKS)[number];

/** 24×24 stroke icons. Paths are drawn with round caps and no fill. */
const ICONS: Record<string, string> = {
  bubble: "M4 5h16v11H11l-4 4v-4H4z",
  checkBubble: "M4 5h16v11H11l-4 4v-4H4z M8.5 10.5l2 2 4-4",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  plane: "M3 11l18-8-8 18-2-8z M11 13l10-10",
  smile: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8.5 14c1 1.5 2.2 2 3.5 2s2.5-.5 3.5-2 M9 9.5v.5 M15 9.5v.5",
  coffee: "M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z M16 10h2a2.5 2.5 0 0 1 0 5h-2 M8 3v2 M12 3v2",
  briefcase: "M4 8h16v11H4z M9 8V5h6v3 M4 13h16",
  phone: "M7 3h10v18H7z M11 18h2",
  bulb: "M9 17h6 M10 20h4 M12 3a6 6 0 0 0-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0 0 12 3z",
  bus: "M4 5h16v11H4z M4 10h16 M7 16v3 M17 16v3 M7.5 13h.01 M16.5 13h.01 M8 7.5h8",
  baobab:
    "M10 21c.6-3 .6-5 0-8 M14 21c-.6-3-.6-5 0-8 M12 13c-5 0-8-2-8-5 0-2 2-3 4-3 1-2 7-2 8 0 2 0 4 1 4 3 0 3-3 5-8 5z",
  leaf: "M5 19C5 10 10 5 20 4c0 10-5 15-15 15z M5 19l8-8",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  cloud: "M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5 4.5 4.5 0 0 1 17.5 18z",
  note: "M9 18V5l11-2v13 M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3z M20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
  camera: "M3 8h4l2-3h6l2 3h4v11H3z M12 11a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  pin: "M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  laptop: "M5 6h14v9H5z M3 18h18",
  calculator:
    "M6 3h12v18H6z M9 7h6 M9 11h.01 M12 11h.01 M15 11h.01 M9 14h.01 M12 14h.01 M15 14h.01 M9 17h.01 M12 17h.01 M15 17h.01",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9.5 8v8 M9.5 12.5l4.5-4.5 M11.5 11l3 5",
  megaphone: "M4 10v4h3l8 4V6L7 10z M18 9a4 4 0 0 1 0 6",
  thumbs: "M7 11v9H4v-9z M7 11l4-8c2 0 3 1 2.5 3L13 9h6a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 18 19H7",
  mountain: "M3 19l6-10 4 6 3-4 5 8z",
  wave: "M3 9c3-3 6 3 9 0s6 3 9 0 M3 15c3-3 6 3 9 0s6 3 9 0",
  triangle: "M12 4l8 15H4z",
  circle: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
  square: "M5 5h14v14H5z",
  plus: "M12 5v14 M5 12h14",
  zigzag: "M3 15l4-6 4 6 4-6 4 6",
  diamond: "M12 3l8 9-8 9-8-9z",
  ring: "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
};

export const WALLPAPER_PACK_INFO: Record<
  WallpaperPackId,
  { label: string; blurb: string; icons: string[] }
> = {
  "kenya-work": {
    label: "Kenyan workplace",
    blurb: "Matatus, coffee, briefcases and baobabs",
    icons: ["bus", "briefcase", "coffee", "phone", "baobab", "coin", "laptop", "bulb", "calculator", "pin", "clock", "bubble"],
  },
  messenger: {
    label: "Classic messenger",
    blurb: "Bubbles, planes, hearts and stars",
    icons: ["bubble", "plane", "heart", "star", "smile", "sparkle", "thumbs", "note", "camera", "checkBubble", "moon", "cloud"],
  },
  friends: {
    label: "Friends & fun",
    blurb: "Smiles, music, cameras and sparkles",
    icons: ["smile", "note", "camera", "sparkle", "heart", "megaphone", "star", "thumbs", "plane", "sun"],
  },
  nature: {
    label: "Nature",
    blurb: "Leaves, hills, sun and clouds",
    icons: ["leaf", "sun", "cloud", "mountain", "wave", "moon", "baobab", "sparkle", "leaf", "wave"],
  },
  geometric: {
    label: "Geometric",
    blurb: "Shapes and zigzags",
    icons: ["triangle", "circle", "square", "plus", "zigzag", "diamond", "ring", "wave"],
  },
  dots: { label: "Dots", blurb: "A quiet dot grid", icons: [] },
  lines: { label: "Lines", blurb: "Fine diagonal lines", icons: [] },
};

const TILE = 208;
const CELL = 52;
const ROTATIONS = [-16, 10, -6, 18, -12, 5, 14, -20, 8, -3, 16, -9];

function iconSvg(name: string, x: number, y: number, rotation: number) {
  const d = ICONS[name];
  if (!d) return "";
  // Centre the 24px icon on (x, y), enlarge slightly and tilt it.
  return `<path transform="translate(${x} ${y}) rotate(${rotation}) scale(1.05) translate(-12 -12)" d="${d}"/>`;
}

/** Builds the SVG source of a seamless tile. Strokes are opaque black: the tile is used as a mask. */
export function buildWallpaperTileSvg(pack: WallpaperPackId): string {
  const info = WALLPAPER_PACK_INFO[pack];
  let body = "";
  if (pack === "dots") {
    const dots: string[] = [];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) dots.push(`<circle cx="${x * CELL + CELL / 2}" cy="${y * CELL + CELL / 2}" r="1.6"/>`);
    }
    body = `<g fill="#000">${dots.join("")}</g>`;
  } else if (pack === "lines") {
    const lines: string[] = [];
    for (let i = -8; i <= 8; i++) lines.push(`<path d="M${i * 26} 0L${i * 26 + TILE} ${TILE}"/>`);
    body = `<g fill="none" stroke="#000" stroke-width="1">${lines.join("")}</g>`;
  } else {
    const parts: string[] = [];
    const n = info.icons.length;
    for (let row = 0; row < 4; row++) {
      const offset = row % 2 === 1 ? CELL / 2 : 0;
      for (let col = 0; col < 4; col++) {
        const index = (row * 5 + col * 3) % n;
        const rotation = ROTATIONS[(row * 4 + col) % ROTATIONS.length]!;
        const x = col * CELL + CELL / 2 + offset;
        const y = row * CELL + CELL / 2;
        parts.push(iconSvg(info.icons[index]!, x, y, rotation));
      }
      // Shifted rows put their last icon on the right edge; repeat it on the left edge so the tile wraps seamlessly.
      if (offset) {
        const lastIndex = (row * 5 + 3 * 3) % n;
        parts.push(iconSvg(info.icons[lastIndex]!, 0, row * CELL + CELL / 2, ROTATIONS[(row * 4 + 3) % ROTATIONS.length]!));
      }
    }
    body = `<g fill="none" stroke="#000" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${parts.join("")}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">${body}</svg>`;
}

export function wallpaperTileUrl(pack: WallpaperPackId): string {
  return `url("data:image/svg+xml,${encodeURIComponent(buildWallpaperTileSvg(pack))}")`;
}

export const WALLPAPER_GRADIENTS = [
  { label: "Sand", css: "linear-gradient(160deg, #f6ecdc, #ecdde0)" },
  { label: "Mist", css: "linear-gradient(160deg, #e6ecf5, #d9e4ee)" },
  { label: "Sage", css: "linear-gradient(160deg, #e9efe0, #d7e4da)" },
  { label: "Blush", css: "linear-gradient(160deg, #fbe7e3, #f2dbe8)" },
  { label: "Dusk", css: "linear-gradient(160deg, #2b2a4c, #4a3a63)" },
  { label: "Forest", css: "linear-gradient(160deg, #0f2a22, #1c4636)" },
  { label: "Ink", css: "linear-gradient(160deg, #12151a, #232a33)" },
  { label: "Sunrise", css: "linear-gradient(160deg, #ffd9b8, #f7b6c2)" },
] as const;

export const WALLPAPER_SOLIDS = [
  "#eee3cf", "#e2e8d5", "#dce8ed", "#f3dfda", "#e8e0f0", "#fdf6d8",
  "#2a2d31", "#151719", "#10241c", "#241a2e",
] as const;

export type WallpaperKind = "plain" | "solid" | "gradient" | "pattern";

export type WallpaperSettings = {
  wallpaper: WallpaperKind;
  pack: WallpaperPackId;
  wallpaperColor: string;
  gradient: number;
  /** Pattern strength 0–100. */
  patternOpacity: number;
  /** Pattern tile size as a percentage of the default. */
  patternScale: number;
  /** Optional flat colour behind the pattern; null follows the theme. */
  patternBase: string | null;
  /** Darkening of the whole wallpaper, 0–60. */
  dim: number;
};

function luminance(hex: string) {
  const rgb = hex.match(/[\da-f]{2}/gi)?.slice(0, 3).map((part) => parseInt(part, 16)) ?? [128, 128, 128];
  return (rgb[0]! * 299 + rgb[1]! * 587 + rgb[2]! * 114) / 1000;
}

export function isDarkColor(hex: string) {
  return luminance(hex) < 140;
}

export type WallpaperLayers = {
  /** CSS `background` for the base layer, or null to let the theme surface show. */
  base: string | null;
  pattern: { tile: string; size: number; ink: string | null; opacity: number } | null;
  dim: number;
};

/** Turns wallpaper settings into the layers the chat surface renders, behind the messages. */
export function getWallpaperLayers(settings: WallpaperSettings): WallpaperLayers {
  const dim = Math.max(0, Math.min(60, settings.dim)) / 100;
  if (settings.wallpaper === "solid") return { base: settings.wallpaperColor, pattern: null, dim };
  if (settings.wallpaper === "gradient") {
    const gradient = WALLPAPER_GRADIENTS[settings.gradient] ?? WALLPAPER_GRADIENTS[0];
    return { base: gradient.css, pattern: null, dim };
  }
  if (settings.wallpaper === "pattern" && settings.patternOpacity > 0) {
    return {
      base: settings.patternBase,
      pattern: {
        tile: wallpaperTileUrl(settings.pack),
        size: Math.round((TILE * Math.max(50, Math.min(200, settings.patternScale))) / 100),
        ink: settings.patternBase ? (isDarkColor(settings.patternBase) ? "#ffffff" : "#1d1b16") : null,
        opacity: Math.max(0, Math.min(100, settings.patternOpacity)) / 100 * 0.3,
      },
      dim,
    };
  }
  if (settings.wallpaper === "pattern") return { base: settings.patternBase, pattern: null, dim };
  return { base: null, pattern: null, dim: 0 };
}
