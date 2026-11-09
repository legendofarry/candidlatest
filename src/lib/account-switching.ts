export type RememberedAccount = {
  uid: string;
  email: string;
  username: string | null;
  displayName: string | null;
  photoURL: string | null;
  lastUsedAt: number;
  premium?: boolean;
  trusted?: boolean;
};

export const MAX_REMEMBERED_ACCOUNTS = 3;

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
    typeof account.lastUsedAt === "number" &&
    (account.premium === undefined || typeof account.premium === "boolean") &&
    (account.trusted === undefined || typeof account.trusted === "boolean")
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
  const { premium, trusted, ...accountDetails } = account;
  const updatedAccount = {
    ...existing,
    ...accountDetails,
    username: account.username ?? existing?.username ?? null,
    displayName: account.displayName ?? existing?.displayName ?? null,
    photoURL: account.photoURL ?? existing?.photoURL ?? null,
    ...(typeof premium === "boolean"
      ? { premium }
      : existing?.premium !== undefined
        ? { premium: existing.premium }
        : {}),
    ...(typeof trusted === "boolean"
      ? { trusted }
      : existing?.trusted !== undefined
        ? { trusted: existing.trusted }
        : {}),
  };
  const updated = [updatedAccount, ...accounts.filter((saved) => saved.uid !== account.uid)].sort(
    (a, b) => b.lastUsedAt - a.lastUsedAt,
  );
  saveAccounts(updated);
  return updated;
}

export function setRememberedAccountTrusted(uid: string, trusted: boolean) {
  const accounts = getRememberedAccounts();
  const updated = accounts.map((account) =>
    account.uid === uid ? { ...account, trusted } : account,
  );
  saveAccounts(updated);
  return updated;
}

export function clearRememberedAccountTrust() {
  const accounts = getRememberedAccounts();
  const updated = accounts.map((account) => ({ ...account, trusted: false }));
  saveAccounts(updated);
  return updated;
}

export function canAddRememberedAccount(
  accounts: RememberedAccount[],
  activeUid: string,
  activePremiumAccess?: boolean,
) {
  if (accounts.length >= MAX_REMEMBERED_ACCOUNTS) return false;
  return accounts.some((account) =>
    account.uid === activeUid && activePremiumAccess !== undefined
      ? activePremiumAccess
      : account.premium === true,
  );
}

export function updateRememberedAccountPhotos(photosByUsername: Record<string, string>) {
  const normalizedPhotos = new Map(
    Object.entries(photosByUsername).map(([username, photoURL]) => [
      username.toLowerCase(),
      photoURL,
    ]),
  );
  const accounts = getRememberedAccounts();
  let changed = false;
  const updated = accounts.map((account) => {
    if (account.photoURL || !account.username) return account;
    const photoURL = normalizedPhotos.get(account.username.toLowerCase());
    if (!photoURL) return account;
    changed = true;
    return { ...account, photoURL };
  });
  if (changed) saveAccounts(updated);
  return updated;
}

export function forgetRememberedAccount(uid: string) {
  const accounts = getRememberedAccounts().filter((account) => account.uid !== uid);
  saveAccounts(accounts);
  return accounts;
}
