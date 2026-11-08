import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  forgetRememberedAccount,
  getRememberedAccounts,
  rememberAccount,
  type RememberedAccount,
} from "./account-switching.ts";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  },
});

const account = (uid: string, lastUsedAt: number): RememberedAccount => ({
  uid,
  email: `${uid}@example.com`,
  username: uid,
  displayName: null,
  photoURL: null,
  lastUsedAt,
});

beforeEach(() => storage.clear());

test("remembered accounts sort by recent use and update existing identity", () => {
  rememberAccount(account("older", 1));
  rememberAccount(account("newer", 2));
  rememberAccount({ ...account("older", 3), username: "updated" });

  assert.deepEqual(
    getRememberedAccounts().map(({ uid, username }) => ({ uid, username })),
    [
      { uid: "older", username: "updated" },
      { uid: "newer", username: "newer" },
    ],
  );
});

test("refreshing account metadata does not erase previously saved profile details", () => {
  rememberAccount({ ...account("member", 1), photoURL: "https://example.com/avatar.png" });
  rememberAccount({ ...account("member", 2), photoURL: null });

  assert.equal(getRememberedAccounts()[0]?.photoURL, "https://example.com/avatar.png");
});

test("forgetting an account removes only that account", () => {
  rememberAccount(account("one", 1));
  rememberAccount(account("two", 2));

  assert.deepEqual(
    forgetRememberedAccount("one").map(({ uid }) => uid),
    ["two"],
  );
});
