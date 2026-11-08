import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { signInWithEmailAndPassword } from "firebase/auth";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Lottie } from "lottie-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { firebaseAuth } from "@/integrations/firebase/client";
import accountSwitchAnimation from "@/assets/account-switch.json";
import {
  forgetRememberedAccount,
  getRememberedAccounts,
  rememberAccount,
  type RememberedAccount,
  updateRememberedAccountPhotos,
} from "@/lib/account-switching";
import { notify } from "@/lib/notifications-store";
import { getAccountProfileAvatars } from "@/lib/messaging.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { ProfileAvatar } from "@/components/site/profile-photo";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  LogIn,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  profilePhotoUrl: string | null;
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

export function AccountSwitcher({ open, onOpenChange, user, username, profilePhotoUrl }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const reduceMotion = Boolean(useReducedMotion());
  const fetchAccountAvatars = useServerFn(getAccountProfileAvatars);
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
    let active = true;
    const usernames = getRememberedAccounts()
      .flatMap((account) => (!account.photoURL && account.username ? [account.username] : []))
      .slice(0, 50);
    if (usernames.length > 0) {
      void fetchAccountAvatars({ data: { usernames } })
        .then((photos) => {
          if (active) setAccounts(updateRememberedAccountPhotos(photos));
        })
        .catch((avatarError: unknown) => {
          if (active) {
            notify.error(
              avatarError instanceof Error
                ? avatarError.message
                : "Could not load remembered account profile photos.",
            );
          }
        });
    }
    return () => {
      active = false;
    };
  }, [open, fetchAccountAvatars]);

  useEffect(() => {
    if (!user.email) return;
    try {
      const currentAccounts = rememberAccount({
        uid: user.uid,
        email: user.email,
        username,
        displayName: user.displayName,
        photoURL: profilePhotoUrl ?? user.photoURL,
        lastUsedAt: Date.now(),
      });
      setAccounts(currentAccounts);
    } catch (saveError) {
      setAccounts(getRememberedAccounts());
      notify.error(
        saveError instanceof Error ? saveError.message : "Could not remember this account.",
      );
    }
  }, [user.uid, user.email, user.displayName, user.photoURL, username, profilePhotoUrl]);

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
      <div className="flex min-h-full flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {mode === "list" ? (
            <motion.div
              key="account-list"
              initial={reduceMotion ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              {...(!reduceMotion ? { exit: { opacity: 0, x: 12 } } : {})}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
              className="space-y-4"
            >
              <section className="space-y-2">
                <div className="overflow-hidden rounded-[1.4rem] border border-border/80 bg-card/80 shadow-sm">
                  <AnimatePresence initial={false}>
                    {accounts.map((account, index) => {
                      const current = account.uid === user.uid;
                      return (
                        <motion.div
                          key={account.uid}
                          layout={!reduceMotion}
                          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          {...(!reduceMotion ? { exit: { opacity: 0, x: -16 } } : {})}
                          transition={{
                            duration: reduceMotion ? 0 : 0.2,
                            delay: reduceMotion ? 0 : Math.min(index * 0.045, 0.18),
                          }}
                          {...(!reduceMotion ? { whileHover: { x: 2 } } : {})}
                          className={cn(
                            "group flex items-center gap-3 border-b border-border/70 p-3.5 transition-colors hover:bg-muted/70 last:border-b-0",
                            current && "bg-primary/[0.06]",
                          )}
                        >
                          <ProfileAvatar
                            photoUrl={account.photoURL}
                            initials={(
                              account.username?.[0] ||
                              account.displayName?.[0] ||
                              account.email[0] ||
                              "U"
                            ).toUpperCase()}
                            className={cn(
                              "size-12 shrink-0 ring-2 ring-background",
                              current && "ring-primary/30",
                            )}
                          />
                          <button
                            type="button"
                            disabled={current}
                            onClick={() => chooseAccount(account)}
                            className="min-w-0 flex-1 text-left disabled:cursor-default"
                          >
                            <span className="flex items-center gap-2">
                              <span className="block truncate text-sm font-semibold">
                                {accountTitle(account)}
                              </span>
                              {current ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                  <span className="size-1.5 rounded-full bg-primary" />
                                  Active
                                </span>
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
                            <>
                              <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Forget ${accountTitle(account)}`}
                                title="Remove from this device"
                                className="size-9 shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => forgetAccount(account)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </section>
              <motion.div {...(!reduceMotion ? { whileTap: { scale: 0.985 } } : {})}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full justify-start rounded-2xl border-dashed bg-background/60 text-sm"
                  onClick={() => {
                    setMode("add");
                    setSelectedAccount(null);
                    setEmail("");
                    setPassword("");
                    setError(null);
                  }}
                >
                  <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Plus className="size-4" />
                  </span>
                  Add another account
                </Button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.form
              key={mode}
              initial={reduceMotion ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              {...(!reduceMotion ? { exit: { opacity: 0, x: -12 } } : {})}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
              onSubmit={(event) => void submit(event)}
              className="space-y-4"
            >
              <button
                type="button"
                onClick={() => {
                  setMode("list");
                  setError(null);
                  setPassword("");
                }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" /> Back to accounts
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
                  className="h-12 rounded-xl"
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
                  className="h-12 rounded-xl"
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
                <motion.p
                  initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                  className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </motion.p>
              ) : null}
              <Button
                type="submit"
                className="h-12 w-full rounded-xl"
                disabled={busy || !email.trim() || !password}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                {busy
                  ? "Signing in…"
                  : mode === "add"
                    ? "Sign in and add account"
                    : "Switch account"}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
        {isMobile && mode === "list" ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, delay: reduceMotion ? 0 : 0.15 }}
            className="mt-auto flex min-h-40 flex-col items-center justify-center pt-2 text-center"
          >
            <div aria-hidden="true" className="pointer-events-none h-36 w-60 max-w-full">
              <Lottie
                src={accountSwitchAnimation}
                autoplay={!reduceMotion}
                loop={!reduceMotion}
                className="h-full w-full"
              />
            </div>
            <p className="-mt-2 text-xs font-medium text-muted-foreground">
              Your accounts, one easy switch
            </p>
          </motion.div>
        ) : null}
      </div>
    </div>
  );

  const modalHeader = (
    <div className="relative isolate shrink-0 overflow-hidden border-b border-border/70 px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-20 size-48 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="relative flex items-center gap-3">
        <motion.span
          initial={reduceMotion ? false : { scale: 0.75, rotate: -10, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary"
        >
          <UserRound className="size-5" />
        </motion.span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {mode === "list"
              ? "Your accounts"
              : mode === "add"
                ? "Add an account"
                : "Switch account"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === "list" ? "" : "Your password stays private and is never saved."}
          </p>
        </div>
      </div>
    </div>
  );

  return isMobile ? (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="!z-[110] flex h-[min(82dvh,42rem)] max-h-[90dvh] flex-col overflow-hidden rounded-t-[2rem] border-border bg-background shadow-[0_-20px_70px_-20px_rgba(0,0,0,0.35)] [&>div:first-child]:h-1.5 [&>div:first-child]:w-10 [&>div:first-child]:bg-muted-foreground/30">
        <DrawerTitle className="sr-only">Switch accounts</DrawerTitle>
        <DrawerDescription className="sr-only">
          Switch between accounts remembered on this device or sign in to add another.
        </DrawerDescription>
        {modalHeader}
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
        {modalHeader}
        {body}
      </DialogContent>
    </Dialog>
  );
}
