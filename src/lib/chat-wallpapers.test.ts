import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLPAPER_PACKS,
  WALLPAPER_PACK_INFO,
  buildWallpaperTileSvg,
  getWallpaperLayers,
  type WallpaperSettings,
} from "./chat-wallpapers.ts";

const base: WallpaperSettings = {
  wallpaper: "pattern",
  pack: "kenya-work",
  wallpaperColor: "#eee3cf",
  gradient: 0,
  patternOpacity: 50,
  patternScale: 100,
  patternBase: null,
  dim: 0,
};

test("every pack builds a valid tile and every named icon exists", () => {
  for (const pack of WALLPAPER_PACKS) {
    const svg = buildWallpaperTileSvg(pack);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 208 208"/);
    assert.ok(svg.endsWith("</svg>"));
    if (WALLPAPER_PACK_INFO[pack].icons.length > 0) {
      assert.ok(!svg.includes('d=""'), `${pack} references an unknown icon`);
      assert.ok((svg.match(/<path/g) ?? []).length >= 16, `${pack} should be densely filled`);
    }
  }
});

test("pattern wallpaper produces a mask layer and never a base colour by default", () => {
  const layers = getWallpaperLayers(base);
  assert.equal(layers.base, null);
  assert.ok(layers.pattern);
  assert.equal(layers.pattern!.size, 208);
  assert.ok(layers.pattern!.opacity > 0 && layers.pattern!.opacity <= 0.3);
});

test("a custom base colour picks a readable ink", () => {
  assert.equal(getWallpaperLayers({ ...base, patternBase: "#10241c" }).pattern!.ink, "#ffffff");
  assert.equal(getWallpaperLayers({ ...base, patternBase: "#fdf6d8" }).pattern!.ink, "#1d1b16");
});

test("plain wallpaper adds nothing and strength 0 hides the pattern", () => {
  assert.deepEqual(getWallpaperLayers({ ...base, wallpaper: "plain", dim: 40 }), { base: null, pattern: null, dim: 0 });
  assert.equal(getWallpaperLayers({ ...base, patternOpacity: 0 }).pattern, null);
});

test("dim is clamped and gradients fall back safely", () => {
  assert.equal(getWallpaperLayers({ ...base, wallpaper: "solid", dim: 999 }).dim, 0.6);
  assert.ok(getWallpaperLayers({ ...base, wallpaper: "gradient", gradient: 99 }).base?.startsWith("linear-gradient"));
});
