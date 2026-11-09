import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isNotificationActivityEnabled,
  NOTIFICATION_ACTIVITY_OPTIONS,
  type NotificationActivityPreferences,
} from "./notifications-store.ts";

test("notification activity preferences default to visible", () => {
  const enabled = Object.fromEntries(
    NOTIFICATION_ACTIVITY_OPTIONS.map(({ id }) => [id, true]),
  ) as NotificationActivityPreferences;

  for (const { id } of NOTIFICATION_ACTIVITY_OPTIONS) {
    assert.equal(isNotificationActivityEnabled(id, enabled), true);
  }
});

test("disabled activity types stay hidden while other types remain visible", () => {
  const preferences = Object.fromEntries(
    NOTIFICATION_ACTIVITY_OPTIONS.map(({ id }) => [id, id !== "mention"]),
  ) as NotificationActivityPreferences;

  assert.equal(isNotificationActivityEnabled("mention", preferences), false);
  assert.equal(isNotificationActivityEnabled("follow", preferences), true);
  assert.equal(isNotificationActivityEnabled(undefined, preferences), true);
});
