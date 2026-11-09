import assert from "node:assert/strict";
import { test } from "node:test";
import { canViewerSeeProfileContributions } from "./profile-visibility.ts";

test("private profile contributions are visible only to the owner", () => {
  assert.equal(canViewerSeeProfileContributions("private", "owner", "owner"), true);
  assert.equal(canViewerSeeProfileContributions("private", "owner", "approved-follower"), false);
  assert.equal(canViewerSeeProfileContributions("private", "owner", null), false);
});

test("public profile contributions remain visible to everyone", () => {
  assert.equal(canViewerSeeProfileContributions("public", "owner", "visitor"), true);
  assert.equal(canViewerSeeProfileContributions(undefined, "owner", null), true);
});
