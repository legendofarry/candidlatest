import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  canAddRememberedAccount,
  clearRememberedAccountTrust,
  forgetRememberedAccount,
  getRememberedAccounts,
  MAX_REMEMBERED_ACCOUNTS,
  rememberAccount,
  setRememberedAccountTrusted,
  updateRememberedAccountPhotos,
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

test("profile photo lookup fills missing saved avatars without replacing existing photos", () => {
  rememberAccount({ ...account("avatar", 1), photoURL: null });
  rememberAccount({ ...account("existing", 2), photoURL: "https://example.com/existing.png" });

  const updated = updateRememberedAccountPhotos({
    AVATAR: "https://example.com/avatar.png",
    existing: "https://example.com/new.png",
  });

  assert.deepEqual(
    updated.map(({ uid, photoURL, lastUsedAt }) => ({ uid, photoURL, lastUsedAt })),
    [
      { uid: "existing", photoURL: "https://example.com/existing.png", lastUsedAt: 2 },
      { uid: "avatar", photoURL: "https://example.com/avatar.png", lastUsedAt: 1 },
    ],
  );
});

test("forgetting an account removes only that account", () => {
  rememberAccount(account("one", 1));
  rememberAccount(account("two", 2));

  assert.deepEqual(
    forgetRememberedAccount("one").map(({ uid }) => uid),
    ["two"],
  );
});

test("a saved Premium account unlocks adding even when the active account is free", () => {
  const accounts = [
    { ...account("free-active", 2), premium: false },
    { ...account("premium", 1), premium: true },
  ];

  assert.equal(canAddRememberedAccount(accounts, "free-active", false), true);
});

test("active membership overrides stale saved Premium status", () => {
  const accounts = [{ ...account("expired-premium", 1), premium: true }];

  assert.equal(canAddRememberedAccount(accounts, "expired-premium", false), false);
  assert.equal(canAddRememberedAccount(accounts, "expired-premium", true), true);
});

test("the Premium account limit counts all saved accounts", () => {
  const accounts = Array.from({ length: MAX_REMEMBERED_ACCOUNTS }, (_, index) =>
    index === 1
      ? { ...account(`saved-${index}`, index), premium: true }
      : { ...account(`saved-${index}`, index), premium: false },
  );

  assert.equal(canAddRememberedAccount(accounts, "saved-1", true), false);
});

test("legacy remembered accounts remain valid and retain Premium metadata when refreshed", () => {
  rememberAccount(account("legacy", 1));
  assert.equal(getRememberedAccounts()[0]?.premium, undefined);

  rememberAccount({ ...account("legacy", 2), premium: true });
  rememberAccount(account("legacy", 3));

  assert.equal(getRememberedAccounts()[0]?.premium, true);
});

test("trust status is stored per saved account and cleared when device keys are replaced", () => {
  rememberAccount({ ...account("trusted", 2), trusted: true });
  rememberAccount({ ...account("untrusted", 1), trusted: false });

  setRememberedAccountTrusted("untrusted", true);
  assert.deepEqual(
    getRememberedAccounts().map(({ uid, trusted }) => ({ uid, trusted })),
    [
      { uid: "trusted", trusted: true },
      { uid: "untrusted", trusted: true },
    ],
  );

  clearRememberedAccountTrust();
  assert.deepEqual(
    getRememberedAccounts().map(({ uid, trusted }) => ({ uid, trusted })),
    [
      { uid: "trusted", trusted: false },
      { uid: "untrusted", trusted: false },
    ],
  );
});
