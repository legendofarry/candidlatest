import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { firebaseAuth } from "@/integrations/firebase/client";
import {
  forgetRememberedAccount,
  getRememberedAccounts,
  rememberAccount,
  type RememberedAccount,
} from "@/lib/account-switching";
import { notify } from "@/lib/notifications-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { Check, Loader2, LogIn, Plus, Trash2, UserRound } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  };
  username: string | null;
};

function authErrorMessage(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (
    [
      "auth/invalid-credential",
      "auth/wrong-password",
      "auth/user-not-found",
      "auth/invalid-login-credentials",
    ].includes(code)
  ) {
    return "That email or password wasn’t recognized. Check your details and try again.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a little and try again.";
  if (code === "auth/user-disabled")
    return "This account is disabled. Contact Candid support for help.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/network-request-failed") return "Check your connection and try again.";
  return error instanceof Error ? error.message : "Could not switch accounts. Please try again.";
}

function accountTitle(account: RememberedAccount) {
  if (account.username) return `@${account.username}`;
  return account.displayName || account.email;
}

export function AccountSwitcher({ open, onOpenChange, user, username }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<RememberedAccount | null>(null);
  const [mode, setMode] = useState<"list" | "switch" | "add">("list");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAccounts(getRememberedAccounts());
    setSelectedAccount(null);
    setMode("list");
    setEmail("");
    setPassword("");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!user.email) return;
    try {
      const currentAccounts = rememberAccount({
        uid: user.uid,
        email: user.email,
        username,
        displayName: user.displayName,
        photoURL: user.photoURL,
        lastUsedAt: Date.now(),
      });
      setAccounts(currentAccounts);
    } catch (saveError) {
      setAccounts(getRememberedAccounts());
      notify.error(
        saveError instanceof Error ? saveError.message : "Could not remember this account.",
      );
    }
  }, [user.uid, user.email, user.displayName, user.photoURL, username]);

  function chooseAccount(account: RememberedAccount) {
    if (account.uid === user.uid) return;
    setSelectedAccount(account);
    setEmail(account.email);
    setPassword("");
    setError(null);
    setMode("switch");
  }

  function forgetAccount(account: RememberedAccount) {
    if (account.uid === user.uid) return;
    try {
      setAccounts(forgetRememberedAccount(account.uid));
      if (selectedAccount?.uid === account.uid) {
        setSelectedAccount(null);
        setMode("list");
      }
    } catch (forgetError) {
      notify.error(
        forgetError instanceof Error ? forgetError.message : "Could not remove the saved account.",
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      if (credential.user.email) {
        const nextAccounts = rememberAccount({
          uid: credential.user.uid,
          email: credential.user.email,
          username: credential.user.uid === selectedAccount?.uid ? selectedAccount.username : null,
          displayName: credential.user.displayName,
          photoURL: credential.user.photoURL,
          lastUsedAt: Date.now(),
        });
        setAccounts(nextAccounts);
      }
      setPassword("");
      onOpenChange(false);
      await navigate({ to: "/auth" });
    } catch (signInError) {
      setError(authErrorMessage(signInError));
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-5">
      {mode === "list" ? (
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {accounts.map((account) => {
                const current = account.uid === user.uid;
                return (
                  <div key={account.uid} className="flex items-center gap-3 p-3">
                    <ProfileAvatar
                      photoUrl={account.photoURL}
                      initials={(
                        account.username?.[0] ||
                        account.displayName?.[0] ||
                        account.email[0] ||
                        "U"
                      ).toUpperCase()}
                      className="size-11 shrink-0"
                    />
                    <button
                      type="button"
                      disabled={current}
                      onClick={() => chooseAccount(account)}
                      className="min-w-0 flex-1 text-left disabled:cursor-default"
                    >
                      <span className="block truncate text-sm font-semibold">
                        {accountTitle(account)}
                        {current ? (
                          <span className="ml-2 text-xs font-medium text-primary">Current</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {account.email}
                      </span>
                    </button>
                    {current ? (
                      <Check
                        className="size-4 shrink-0 text-primary"
                        aria-label="Current account"
                      />
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Forget ${accountTitle(account)}`}
                        title="Remove from this device"
                        className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                        onClick={() => forgetAccount(account)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-start rounded-xl"
            onClick={() => {
              setMode("add");
              setSelectedAccount(null);
              setEmail("");
              setPassword("");
              setError(null);
            }}
          >
            <Plus className="size-4" /> Add another account
          </Button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setMode("list");
              setError(null);
              setPassword("");
            }}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to accounts
          </button>
          <div className="space-y-1">
            <h3 className="font-display text-lg font-semibold">
              {mode === "add"
                ? "Add an account"
                : `Switch to ${selectedAccount ? accountTitle(selectedAccount) : "account"}`}
            </h3>
            <p className="text-sm text-muted-foreground">
              Sign in with the account’s email and password. Your password won’t be saved.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-switch-email">Email</Label>
            <Input
              id="account-switch-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={mode === "switch" && Boolean(selectedAccount)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-switch-password">Password</Label>
            <Input
              id="account-switch-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11"
            />
          </div>
          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            className="h-11 w-full rounded-xl"
            disabled={busy || !email.trim() || !password}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
            {busy ? "Signing in…" : mode === "add" ? "Sign in and add account" : "Switch account"}
          </Button>
        </form>
      )}
    </div>
  );

  return isMobile ? (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="!z-[110] flex h-[min(82dvh,42rem)] max-h-[90dvh] flex-col overflow-hidden rounded-t-[1.25rem] bg-background">
        <DrawerTitle className="sr-only">Switch accounts</DrawerTitle>
        <DrawerDescription className="sr-only">
          Switch between accounts remembered on this device or sign in to add another.
        </DrawerDescription>
        <div className="shrink-0 border-b border-border px-4 pb-3 pt-4">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {mode === "list" ? "Switch accounts" : "Account sign in"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === "list"
              ? ""
              : "Your credentials stay private."}
          </p>
        </div>
        {body}
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="flex max-h-[min(80dvh,42rem)] w-[min(28rem,94vw)] flex-col gap-0 overflow-hidden rounded-2xl bg-background p-0"
      >
        <DialogTitle className="sr-only">Switch accounts</DialogTitle>
        <DialogDescription className="sr-only">
          Switch between accounts remembered on this device or sign in to add another.
        </DialogDescription>
        <div className="shrink-0 border-b border-border px-5 pb-3 pt-5">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {mode === "list" ? "Switch accounts" : "Account sign in"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === "list"
              ? ""
              : "Your credentials stay private."}
          </p>
        </div>
        {body}
      </DialogContent>
    </Dialog>
  );
}

export function AccountSwitcherMenuItem({ onOpen }: { onOpen: () => void }) {
  return (
    <DropdownMenuItem onSelect={onOpen}>
      <UserRound className="size-4" />
      Switch accounts
    </DropdownMenuItem>
  );
}
