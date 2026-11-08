export type RememberedAccount = {
  uid: string;
  email: string;
  username: string | null;
  displayName: string | null;
  photoURL: string | null;
  lastUsedAt: number;
};

const STORAGE_KEY = "candid.remembered-accounts.v1";

function isRememberedAccount(value: unknown): value is RememberedAccount {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<RememberedAccount>;
  return (
    typeof account.uid === "string" &&
    typeof account.email === "string" &&
    (typeof account.username === "string" || account.username === null) &&
    (typeof account.displayName === "string" || account.displayName === null) &&
    (typeof account.photoURL === "string" || account.photoURL === null) &&
    typeof account.lastUsedAt === "number"
  );
}

export function getRememberedAccounts(): RememberedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRememberedAccount) : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: RememberedAccount[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    throw new Error(
      "Could not save this account on the device. Check browser storage and try again.",
    );
  }
}

export function rememberAccount(account: RememberedAccount) {
  const accounts = getRememberedAccounts();
  const existing = accounts.find((saved) => saved.uid === account.uid);
  const updatedAccount = {
    ...existing,
    ...account,
    username: account.username ?? existing?.username ?? null,
    displayName: account.displayName ?? existing?.displayName ?? null,
    photoURL: account.photoURL ?? existing?.photoURL ?? null,
  };
  const updated = [updatedAccount, ...accounts.filter((saved) => saved.uid !== account.uid)].sort(
    (a, b) => b.lastUsedAt - a.lastUsedAt,
  );
  saveAccounts(updated);
  return updated;
}

export function forgetRememberedAccount(uid: string) {
  const accounts = getRememberedAccounts().filter((account) => account.uid !== uid);
  saveAccounts(accounts);
  return accounts;
}
