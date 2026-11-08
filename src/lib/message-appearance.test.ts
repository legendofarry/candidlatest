import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MESSAGE_APPEARANCE,
  chooseNewer,
  effectiveLook,
  normalizePrefs,
  parseLook,
  stripPremiumPresets,
  defaultPrefs,
} from "./chat-prefs-model.ts";

test("garbage and empty input fall back to defaults", () => {
  assert.deepEqual(normalizePrefs(null), defaultPrefs());
  assert.deepEqual(normalizePrefs("nope"), defaultPrefs());
  assert.equal(normalizePrefs({ version: 2, look: { bubbleColor: "red", dim: 9999 } }).look.dim, 60);
  assert.equal(normalizePrefs({ version: 2, look: { bubbleColor: "red" } }).look.bubbleColor, DEFAULT_MESSAGE_APPEARANCE.bubbleColor);
});

test("a saved v1 appearance is migrated, doodles become pattern packs", () => {
  const migrated = normalizePrefs({ preset: "midnight", wallpaper: "doodles", doodle: "circles", patternIntensity: "more", bubbleColor: "#3c617c" });
  assert.equal(migrated.look.preset, "midnight");
  assert.equal(migrated.look.wallpaper, "pattern");
  assert.equal(migrated.look.pack, "geometric");
  assert.equal(migrated.look.patternOpacity, 70);
  assert.equal(migrated.version, 2);
  assert.equal(normalizePrefs({ wallpaper: "doodles", doodle: "waves", patternIntensity: "off" }).look.patternOpacity, 0);
});

test("per-chat overrides layer over the default and stay valid", () => {
  const prefs = normalizePrefs({ version: 2, look: { pack: "nature" }, chats: { abc: { pack: "dots", bubbleShape: "soft", junk: 1 }, bad: { pack: "nope" } } });
  assert.equal(effectiveLook(prefs, "abc").pack, "dots");
  assert.equal(effectiveLook(prefs, "abc").bubbleShape, "soft");
  assert.equal(effectiveLook(prefs, "other").pack, "nature");
  assert.equal(prefs.chats["bad"], undefined);
});

test("the newest copy wins when syncing", () => {
  const a = { ...defaultPrefs(), updatedAt: 5 };
  assert.equal(chooseNewer(a, { ...a, updatedAt: 9 }), "remote");
  assert.equal(chooseNewer(a, { ...a, updatedAt: 2 }), "local");
  assert.equal(chooseNewer(a, a), "same");
});

test("members without Premium never keep a Premium theme", () => {
  const prefs = normalizePrefs({ version: 2, look: { preset: "ocean" }, chats: { x: { preset: "sunset" }, y: { preset: "rose" } } });
  const safe = stripPremiumPresets(prefs);
  assert.equal(safe.look.preset, "default");
  assert.equal(safe.chats["x"]!.preset, "default");
  assert.equal(safe.chats["y"]!.preset, "rose");
  assert.equal(parseLook({ preset: "zzz" }).preset, undefined);
});
