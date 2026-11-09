import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { signInWithCustomToken, signInWithEmailAndPassword } from "firebase/auth";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { firebaseAuth } from "@/integrations/firebase/client";
import {
  canAddRememberedAccount,
  clearRememberedAccountTrust,
  forgetRememberedAccount,
  getRememberedAccounts,
  MAX_REMEMBERED_ACCOUNTS,
  rememberAccount,
  setRememberedAccountTrusted,
  type RememberedAccount,
  updateRememberedAccountPhotos,
} from "@/lib/account-switching";
import {
  completeTrustedAccountSwitch,
  createTrustedAccountSwitchChallenge,
  registerTrustedAccountDevice,
} from "@/lib/trusted-account.functions";
import { getTrustedDevice, signTrustedSwitch } from "@/lib/trusted-account-device";
import { notify } from "@/lib/notifications-store";
import { getAccountProfileAvatars } from "@/lib/messaging.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProfileAvatar } from "@/components/site/profile-photo";
import {
  ArrowLeft,
  ArrowLeftRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Crown,
  LockKeyhole,
  Loader2,
  LogIn,
  Plus,
  Sparkles,
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
  premiumAccess?: boolean;
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

export function AccountSwitcher({
  open,
  onOpenChange,
  user,
  username,
  profilePhotoUrl,
  premiumAccess,
}: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const reduceMotion = Boolean(useReducedMotion());
  const fetchAccountAvatars = useServerFn(getAccountProfileAvatars);
  const registerTrustedDevice = useServerFn(registerTrustedAccountDevice);
  const createSwitchChallenge = useServerFn(createTrustedAccountSwitchChallenge);
  const completeSwitch = useServerFn(completeTrustedAccountSwitch);
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<RememberedAccount | null>(null);
  const [accountToForget, setAccountToForget] = useState<RememberedAccount | null>(null);
  const [mode, setMode] = useState<"list" | "switch" | "add" | "upgrade" | "switching">("list");
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
    void (async () => {
      try {
        const { device, created } = await getTrustedDevice();
        if (!active) return;
        if (created) setAccounts(clearRememberedAccountTrust());
        await registerTrustedDevice({
          data: { deviceId: device.deviceId, publicKey: device.publicKey },
        });
        if (active) setAccounts(setRememberedAccountTrusted(user.uid, true));
      } catch (deviceError) {
        if (active) {
          notify.error(
            deviceError instanceof Error
              ? deviceError.message
              : "Could not prepare secure account switching on this device.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [open, fetchAccountAvatars, registerTrustedDevice, user.uid]);

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
        ...(premiumAccess === undefined ? {} : { premium: premiumAccess }),
      });
      setAccounts(currentAccounts);
    } catch (saveError) {
      setAccounts(getRememberedAccounts());
      notify.error(
        saveError instanceof Error ? saveError.message : "Could not remember this account.",
      );
    }
  }, [
    user.uid,
    user.email,
    user.displayName,
    user.photoURL,
    username,
    profilePhotoUrl,
    premiumAccess,
  ]);

  async function switchWithTrustedDevice(account: RememberedAccount) {
    setSelectedAccount(account);
    setMode("switching");
    setError(null);
    try {
      const { device } = await getTrustedDevice();
      const challenge = await createSwitchChallenge({
        data: { targetUid: account.uid, deviceId: device.deviceId },
      });
      const proof = await signTrustedSwitch(
        device,
        account.uid,
        challenge.challengeId,
        challenge.nonce,
      );
      const result = await completeSwitch({
        data: {
          targetUid: account.uid,
          deviceId: device.deviceId,
          challengeId: challenge.challengeId,
          proof,
        },
      });
      const credential = await signInWithCustomToken(firebaseAuth, result.customToken);
      if (credential.user.email) {
        const nextAccounts = rememberAccount({
          uid: credential.user.uid,
          email: credential.user.email,
          username: account.username,
          displayName: credential.user.displayName ?? account.displayName,
          photoURL: credential.user.photoURL ?? account.photoURL,
          lastUsedAt: Date.now(),
          trusted: true,
        });
        setAccounts(nextAccounts);
      }
      setPassword("");
      setMode("list");
      onOpenChange(false);
    } catch (switchError) {
      setError(authErrorMessage(switchError));
      setMode("switch");
    }
  }

  function chooseAccount(account: RememberedAccount) {
    if (account.uid === user.uid) return;
    setSelectedAccount(account);
    setEmail(account.email);
    setPassword("");
    setError(null);
    if (account.trusted) {
      void switchWithTrustedDevice(account);
    } else {
      setMode("switch");
    }
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
      setMode("switching");
      if (credential.user.email) {
        let trusted = false;
        try {
          const { device } = await getTrustedDevice();
          await registerTrustedDevice({
            data: { deviceId: device.deviceId, publicKey: device.publicKey },
          });
          trusted = true;
        } catch (deviceError) {
          notify.error(
            deviceError instanceof Error
              ? deviceError.message
              : "Signed in, but this device could not be trusted for quick switching.",
          );
        }
        const nextAccounts = rememberAccount({
          uid: credential.user.uid,
          email: credential.user.email,
          username: credential.user.uid === selectedAccount?.uid ? selectedAccount.username : null,
          displayName: credential.user.displayName,
          photoURL: credential.user.photoURL,
          lastUsedAt: Date.now(),
          trusted,
        });
        setAccounts(nextAccounts);
      }
      setPassword("");
      setMode("list");
      onOpenChange(false);
    } catch (signInError) {
      setError(authErrorMessage(signInError));
      setMode(selectedAccount ? "switch" : "add");
    } finally {
      setBusy(false);
    }
  }

  const canAddAccount = canAddRememberedAccount(accounts, user.uid, premiumAccess);
  const accountLimitReached = accounts.length >= MAX_REMEMBERED_ACCOUNTS;
  const savedAccountCount = accounts.length;

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
                      const premium =
                        current && premiumAccess !== undefined
                          ? premiumAccess
                          : account.premium === true;
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
                              {premium ? (
                                <BadgeCheck
                                  className="size-4 shrink-0 text-verified"
                                  aria-label="Premium account"
                                />
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
                                onClick={() => setAccountToForget(account)}
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
                  variant={canAddAccount ? "outline" : "default"}
                  disabled={accountLimitReached}
                  className={cn(
                    "h-12 w-full justify-start rounded-2xl text-sm",
                    canAddAccount
                      ? "border-dashed bg-background/60"
                      : accountLimitReached
                        ? "cursor-not-allowed bg-muted text-muted-foreground"
                        : "border border-primary/25 bg-gradient-to-r from-primary/15 via-primary/10 to-amber-400/15 text-foreground shadow-sm shadow-primary/10 hover:from-primary/20 hover:via-primary/15 hover:to-amber-400/20",
                  )}
                  onClick={() => {
                    if (accountLimitReached) return;
                    if (!canAddAccount) {
                      setMode("upgrade");
                      return;
                    }
                    setMode("add");
                    setSelectedAccount(null);
                    setEmail("");
                    setPassword("");
                    setError(null);
                  }}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-xl",
                      canAddAccount || accountLimitReached
                        ? "bg-primary/10 text-primary"
                        : "bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground shadow-sm",
                    )}
                  >
                    {accountLimitReached ? (
                      <LockKeyhole className="size-4" />
                    ) : canAddAccount ? (
                      <Plus className="size-4" />
                    ) : (
                      <Crown className="size-4" />
                    )}
                  </span>
                  <span className="flex-1 text-left">
                    {accountLimitReached ? "Account limit reached" : "Add another account"}
                  </span>
                  {accountLimitReached ? (
                    <span className="text-xs font-semibold">{savedAccountCount}/3</span>
                  ) : !canAddAccount ? (
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                      Premium
                    </span>
                  ) : null}
                </Button>
              </motion.div>
            </motion.div>
          ) : mode === "switching" ? (
            <motion.section
              key="switching-account"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
              className="flex min-h-[22rem] flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-primary/[0.08] via-background to-sky-400/[0.12] px-5 py-8 text-center"
            >
              <div className="relative flex size-36 items-center justify-center">
                {!reduceMotion ? (
                  <>
                    <motion.span
                      className="absolute inset-2 rounded-full border border-primary/20"
                      animate={{ rotate: 360, scale: [1, 1.06, 1] }}
                      transition={{
                        rotate: { duration: 7, repeat: Infinity, ease: "linear" },
                        scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                      }}
                    />
                    <motion.span
                      className="absolute inset-0 rounded-full border border-dashed border-sky-400/40"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.span
                      className="absolute -inset-2 rounded-full bg-primary/10 blur-2xl"
                      animate={{ opacity: [0.35, 0.8, 0.35], scale: [0.85, 1.1, 0.85] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </>
                ) : null}
                <ProfileAvatar
                  photoUrl={selectedAccount?.photoURL}
                  initials={(
                    selectedAccount?.username?.[0] ||
                    selectedAccount?.displayName?.[0] ||
                    selectedAccount?.email[0] ||
                    "U"
                  ).toUpperCase()}
                  className="relative z-10 size-24 border-4 border-background shadow-[0_14px_40px_-12px_rgba(0,0,0,0.35)] ring-2 ring-primary/20"
                />
                <motion.span
                  className="absolute bottom-1 right-0 z-20 flex size-10 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-lg"
                  {...(!reduceMotion
                    ? {
                      animate: { scale: [1, 1.1, 1] },
                      transition: {
                        duration: 1.4,
                        repeat: Infinity,
                        ease: "easeInOut" as const,
                      },
                    }
                    : {})}
                >
                  <ArrowLeftRight className="size-4" />
                </motion.span>
              </div>
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : 0.12 }}
                className="mt-5"
              >
                <h3 className="font-display text-xl font-bold tracking-tight">
                  Switching accounts
                </h3>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Securely connecting to{" "}
                  <span className="font-semibold text-foreground">
                    {selectedAccount ? accountTitle(selectedAccount) : "your account"}
                  </span>
                  …
                </p>
              </motion.div>
              {!reduceMotion ? (
                <div className="mt-6 flex items-center gap-1.5" aria-hidden="true">
                  {[0, 1, 2].map((dot) => (
                    <motion.span
                      key={dot}
                      className="size-1.5 rounded-full bg-primary"
                      animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.15, 0.8] }}
                      transition={{
                        duration: 1.1,
                        delay: dot * 0.16,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </motion.section>
          ) : mode === "upgrade" ? (
            <motion.section
              key="premium-upgrade"
              initial={reduceMotion ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
              className="space-y-5"
            >
              <button
                type="button"
                onClick={() => setMode("list")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" /> Back to accounts
              </button>
              <div className="text-center">
                <motion.span
                  initial={reduceMotion ? false : { scale: 0.7, rotate: -12, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 360, damping: 24 }}
                  className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-amber-400/20 text-primary shadow-inner"
                >
                  <Crown className="size-7" />
                </motion.span>
                <h3 className="mt-3 font-display text-xl font-bold tracking-tight">
                  Your accounts, together
                </h3>
                <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  Premium lets you save and switch between up to three accounts on this device.
                </p>
              </div>
              <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-background to-amber-400/[0.08] px-4 py-6">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[75%] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-primary/40 to-transparent"
                />
                <div className="relative flex items-center justify-center gap-3 sm:gap-5">
                  {Array.from({ length: Math.max(MAX_REMEMBERED_ACCOUNTS, savedAccountCount) }).map(
                    (_, index) => {
                      const account = accounts[index];
                      return (
                        <motion.div
                          key={account?.uid ?? `empty-${index}`}
                          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.65 }}
                          animate={
                            reduceMotion
                              ? { opacity: 1, y: 0, scale: 1 }
                              : {
                                opacity: 1,
                                y: [0, -5, 0],
                                scale: 1,
                              }
                          }
                          transition={
                            reduceMotion
                              ? { duration: 0 }
                              : {
                                opacity: { delay: index * 0.3, duration: 0.35 },
                                scale: { delay: index * 0.3, type: "spring", stiffness: 300 },
                                y: {
                                  delay: 0.6 + index * 0.3,
                                  duration: 2,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                },
                              }
                          }
                          className="relative z-10 flex size-[4.25rem] shrink-0 items-center justify-center rounded-full border-2 border-background bg-background shadow-[0_8px_24px_-10px_rgba(0,0,0,0.35)] ring-1 ring-primary/15"
                          aria-label={
                            account
                              ? `Saved account ${accountTitle(account)}`
                              : `Premium account slot ${index + 1}`
                          }
                        >
                          {account ? (
                            <ProfileAvatar
                              photoUrl={account.photoURL}
                              initials={(
                                account.username?.[0] ||
                                account.displayName?.[0] ||
                                account.email[0] ||
                                "U"
                              ).toUpperCase()}
                              className="size-full"
                            />
                          ) : (
                            <span className="flex size-full items-center justify-center rounded-full border border-dashed border-primary/30 bg-primary/[0.04] text-primary/70">
                              <Plus className="size-5" />
                            </span>
                          )}
                        </motion.div>
                      );
                    },
                  )}
                  <motion.span
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: reduceMotion ? 0 : 1.15, type: "spring" }}
                    className="absolute left-1/2 top-1/2 z-20 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/20 bg-background text-primary shadow-md"
                    aria-hidden="true"
                  >
                    <Sparkles className="size-4" />
                  </motion.span>
                </div>
                <p className="relative mt-5 text-center text-xs font-medium text-muted-foreground">
                  {savedAccountCount} {savedAccountCount === 1 ? "account saved" : "accounts saved"}
                  {" · "}up to {MAX_REMEMBERED_ACCOUNTS} with Premium
                </p>
              </div>
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.35,
                  delay: reduceMotion ? 0 : 1.65,
                }}
              >
                <Button
                  type="button"
                  className="h-12 w-full rounded-2xl bg-gradient-to-r from-primary via-primary to-emerald-500 text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-105"
                  onClick={() => {
                    onOpenChange(false);
                    void navigate({ to: "/billing" });
                  }}
                >
                  <Sparkles className="size-4" />
                  Upgrade to Premium
                  <ChevronRight className="ml-auto size-4" />
                </Button>
              </motion.div>
              <p className="text-center text-xs text-muted-foreground">
                Already have Premium on another saved account? Switch to it to add more.
              </p>
            </motion.section>
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
                  Sign in once to trust this device. Next time, switching to this account won’t ask
                  for your password.
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
            <div aria-hidden="true" className="pointer-events-none relative h-36 w-60 max-w-full">
              <motion.div
                className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-2xl"
                animate={reduceMotion ? undefined : { scale: [1, 1.18, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
              {accounts.slice(0, 3).map((account, index) => {
                const total = Math.max(accounts.length, 3);
                const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
                const radius = 52;
                return (
                  <motion.div
                    key={`${account.uid}-preview`}
                    className="absolute left-1/2 top-1/2"
                    animate={
                      reduceMotion
                        ? { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.7 }
                        : {
                            x: [Math.cos(angle) * radius, Math.cos(angle + 0.4) * (radius + 10), Math.cos(angle) * radius],
                            y: [Math.sin(angle) * radius * 0.7, Math.sin(angle + 0.4) * (radius * 0.7 + 10), Math.sin(angle) * radius * 0.7],
                            rotate: [0, 8, 0],
                          }
                    }
                    transition={
                      reduceMotion
                        ? undefined
                        : {
                            duration: 2.8,
                            delay: index * 0.15,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }
                    }
                    style={{ x: 0, y: 0 }}
                  >
                    <ProfileAvatar
                      photoUrl={account.photoURL}
                      initials={(
                        account.username?.[0] ||
                        account.displayName?.[0] ||
                        account.email[0] ||
                        "U"
                      ).toUpperCase()}
                      className="size-11 border-2 border-background shadow-[0_12px_28px_-12px_rgba(0,0,0,0.35)]"
                    />
                  </motion.div>
                );
              })}
              <motion.div
                className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/20 bg-background shadow-[0_18px_42px_-18px_rgba(0,0,0,0.35)]"
                animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], rotate: [0, 8, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                style={{ width: 62, height: 62 }}
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground shadow-inner">
                  <ArrowLeftRight className="size-4" />
                </div>
              </motion.div>
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
                : mode === "upgrade"
                  ? "Premium account switching"
                  : mode === "switching"
                    ? "Connecting securely"
                    : "Switch account"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === "list" || mode === "upgrade" || mode === "switching"
              ? ""
              : "Your password is used once to trust this device and is never saved."}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {isMobile ? (
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
      )}
      <AlertDialog
        open={Boolean(accountToForget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setAccountToForget(null);
        }}
      >
        <AlertDialogContent
          className={cn(
            "z-[130] rounded-2xl sm:max-w-sm",
            isMobile &&
            "!fixed !inset-x-0 !bottom-0 !left-0 !top-auto !z-[130] !grid !max-h-[85dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 !gap-4 !rounded-b-none !rounded-t-3xl !border-border !bg-background !p-5 !pb-[calc(1.25rem+env(safe-area-inset-bottom))] !shadow-[0_-20px_70px_-12px_rgba(0,0,0,0.3)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:!inset-x-auto sm:!bottom-auto sm:!left-1/2 sm:!top-1/2 sm:!w-full sm:!max-w-sm sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!rounded-2xl sm:!p-6 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0",
          )}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Remove saved account?</AlertDialogTitle>
            <AlertDialogDescription>
              {accountToForget
                ? `Remove ${accountTitle(accountToForget)} from this device? This won’t delete the account.`
                : "This removes the account from this device only."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (accountToForget) forgetAccount(accountToForget);
                setAccountToForget(null);
              }}
            >
              Remove account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
