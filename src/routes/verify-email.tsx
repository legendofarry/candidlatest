import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Check,
  ChevronDown,
  Flame,
  Loader2,
  LogOut,
  Mail,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { reload, sendEmailVerification, signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { firebaseAuth } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/useAuth";
import { getOnboardingState } from "@/lib/onboarding.functions";
import {
  firebaseAuthErrorCode,
  requiresEmailVerification,
  verificationActionSettings,
  verificationEmailErrorMessage,
} from "@/lib/email-verification";
import { notify as toast } from "@/lib/notifications-store";

export const Route = createFileRoute("/verify-email")({
  head: () => ({
    meta: [
      { title: "Verify your email | Candid" },
      { name: "description", content: "Confirm your email address to finish setting up Candid." },
    ],
  }),
  component: VerifyEmailPage,
});

type NoticeTone = "success" | "error" | "info";

function VerifyEmailPage() {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const readOnboarding = useServerFn(getOnboardingState);
  const finishing = useRef(false);
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<NoticeTone>("info");
  const [cooldown, setCooldown] = useState(0);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  const continueIntoApp = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    setVerified(true);
    try {
      const current = firebaseAuth.currentUser;
      await current?.getIdToken(true);
      const state = await readOnboarding({ data: undefined });
      await navigate({ to: state.needsOnboarding ? "/onboarding" : "/" });
    } catch {
      finishing.current = false;
      setVerified(false);
      setNoticeTone("error");
      setNotice("Your email is confirmed. We couldn’t open your account yet; try again in a moment.");
    }
  }, [navigate, readOnboarding]);

  const checkVerification = useCallback(
    async (manual = false) => {
      if (manual) setNotice("");
      const current = firebaseAuth.currentUser;
      if (!current) {
        void navigate({ to: "/auth" });
        return;
      }
      try {
        await reload(current);
        if (!requiresEmailVerification(current)) {
          await continueIntoApp();
          return;
        }
        setChecking(false);
        if (manual) {
          setNoticeTone("info");
          setNotice("Still waiting for confirmation. Open the link in your email, then check again.");
          toast.info("Email not confirmed yet.", {
            description: "Open the link in your inbox, then return here.",
            duration: 4500,
          });
        }
      } catch {
        setChecking(false);
        setNoticeTone("error");
        setNotice("We couldn’t check your email status. Check your connection and try again.");
      }
    },
    [continueIntoApp, navigate],
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    if (!requiresEmailVerification(user)) {
      void continueIntoApp();
      return;
    }

    void checkVerification();
    const timer = window.setInterval(() => void checkVerification(), 4000);
    const onFocus = () => void checkVerification();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loading, user, navigate, continueIntoApp, checkVerification]);

  useEffect(() => {
    const sendStatus = window.sessionStorage.getItem("candid:verification-email");
    if (sendStatus === "sent") {
      setNoticeTone("success");
      setNotice("Check your inbox and Spam or Junk for the verification link.");
    } else if (sendStatus?.startsWith("failed")) {
      const code = sendStatus.slice("failed:".length);
      setNoticeTone("error");
      setNotice(verificationEmailErrorMessage(code ? { code } : undefined));
    }
    window.sessionStorage.removeItem("candid:verification-email");
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resendEmail() {
    const current = firebaseAuth.currentUser;
    if (!current || sending || cooldown > 0) return;
    if (!current.email) {
      setNoticeTone("error");
      setNotice("This account has no email address. Sign out and use an email account to continue.");
      return;
    }
    setSending(true);
    setNotice("");
    try {
      await sendEmailVerification(current, verificationActionSettings());
      setCooldown(30);
      setNoticeTone("success");
      setNotice("");
      toast.success("Verification email requested.");
    } catch (error) {
      const code = firebaseAuthErrorCode(error);
      setNoticeTone("error");
      setNotice(verificationEmailErrorMessage(error));
      console.error("Could not resend email verification", code || error);
    } finally {
      setSending(false);
    }
  }

  async function useAnotherAccount() {
    await signOut(firebaseAuth);
    await navigate({ to: "/auth" });
  }

  if (loading || !user || verified) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#050505] px-6 text-[#f5f5f0]">
        <Loader2 className="mr-3 size-5 animate-spin text-[#c7ff00]" />
        <span className="text-sm text-white/55">
          {verified ? "Email confirmed. Opening Candid…" : "Checking your account…"}
        </span>
      </main>
    );
  }

  const hasSendError = noticeTone === "error" && notice.length > 0;

  return (
    <main className="relative isolate h-dvh overflow-hidden bg-[#050505] text-[#f5f5f0]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_8%,_rgba(199,255,0,0.10),_transparent_36%),radial-gradient(ellipse_at_0%_100%,_rgba(0,197,180,0.08),_transparent_42%)]"
      />
      <div className="relative grid h-full min-h-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <aside className="relative hidden h-dvh min-h-0 flex-col justify-between overflow-hidden border-r border-white/10 bg-[#090b09] px-10 py-9 lg:flex xl:px-16 xl:py-12">
          <Link
            to="/"
            className="relative z-10 inline-flex w-fit items-center gap-3 font-display text-2xl font-bold tracking-tight"
          >
            <Flame className="size-8 stroke-[2.2] text-[#c7ff00]" />
            <span>Candid<span className="text-[#c7ff00]">.</span></span>
          </Link>

          <div className="relative z-10 mx-auto flex w-full max-w-lg items-center justify-center">
            <div className="relative flex size-64 items-center justify-center">
              <motion.div
                aria-hidden="true"
                animate={{ rotate: 360 }}
                transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full border border-dashed border-[#c7ff00]/20"
              >
                <span className="absolute left-7 top-9 size-2 rounded-full bg-[#c7ff00] shadow-[0_0_20px_5px_rgba(199,255,0,.25)]" />
              </motion.div>
              <div className="absolute inset-8 rounded-full border border-white/[0.08] bg-[radial-gradient(circle,_rgba(199,255,0,.10),_transparent_66%)]" />
              <motion.div
                animate={{ y: [0, -7, 0], scale: [1, 1.025, 1] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                className="relative flex size-28 items-center justify-center rounded-[2rem] border border-[#c7ff00]/25 bg-[#11150b] shadow-[0_0_90px_-35px_rgba(199,255,0,.55)]"
              >
                <Mail className="size-12 stroke-[1.25] text-[#c7ff00]" />
                <span className="absolute -bottom-3 -right-3 flex size-10 items-center justify-center rounded-2xl border border-[#c7ff00]/25 bg-[#171b10] text-[#c7ff00]">
                  <Check className="size-5" />
                </span>
              </motion.div>
            </div>
          </div>

          <p className="relative z-10 flex items-center gap-2 text-xs text-white/40">
            <ShieldCheck className="size-4 text-[#c7ff00]/75" />
            Your email stays private and is never shown on your stories.
          </p>
          <div aria-hidden="true" className="absolute -bottom-40 -left-24 size-80 rounded-full border border-[#c7ff00]/10" />
        </aside>

        <section className="flex h-dvh min-h-0 flex-col overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:py-8 lg:px-12 xl:px-20">
          <header className="flex w-full items-center justify-between">
            <Link
              to="/"
              className="inline-flex items-center gap-3 font-display text-xl font-bold tracking-tight lg:hidden"
            >
              <Flame className="size-7 stroke-[2.2] text-[#c7ff00]" />
              <span>Candid<span className="text-[#c7ff00]">.</span></span>
            </Link>
            <button
              type="button"
              onClick={() => void useAnotherAccount()}
              aria-label="Sign out and use another account"
              title="Sign out and use another account"
              className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/60 transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white sm:hidden"
            >
              <LogOut className="size-5" />
            </button>
            <div className="relative ml-auto hidden sm:block" ref={accountMenuRef}>
              <button
                type="button"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                aria-controls="verify-account-menu"
                title="Account menu"
                onClick={() => setAccountMenuOpen((open) => !open)}
                className="flex h-11 w-auto cursor-pointer items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] p-1.5 pr-3 text-white/75 transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7ff00]/70"
              >
                <Avatar className="size-8 border border-[#c7ff00]/25">
                  <AvatarImage src={user.photoURL ?? undefined} alt="" />
                  <AvatarFallback className="bg-[#c7ff00]/15 text-xs font-semibold text-[#c7ff00]">
                    {user.email?.slice(0, 1).toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="size-4" />
              </button>
              {accountMenuOpen ? (
                <div
                  id="verify-account-menu"
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-3 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#10110e] p-2 text-white shadow-xl shadow-black/40"
                >
                  <div className="px-3 py-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Signed in as</p>
                    <p className="mt-1 break-all text-sm font-medium text-white/85">
                      {user.email || "No email address linked"}
                    </p>
                  </div>
                  <div className="my-1 h-px bg-white/10" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      void useAnotherAccount();
                    }}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7ff00]/70"
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-none flex-1 flex-col justify-center px-0 py-6 sm:max-w-[540px] sm:py-10 lg:py-12">
            <div aria-hidden="true" className="relative mb-6 flex h-36 items-center justify-center sm:hidden">
              <motion.div
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={reduceMotion ? undefined : { duration: 32, repeat: Infinity, ease: "linear" }}
                className="absolute size-32 rounded-full border border-dashed border-[#c7ff00]/15"
              >
                <span className="absolute left-[18%] top-[17%] size-1.5 rounded-full bg-[#c7ff00]/80 shadow-[0_0_12px_3px_rgba(199,255,0,.25)]" />
              </motion.div>
              <div className="absolute size-24 rounded-full bg-[#c7ff00]/[0.07] blur-xl" />
              <motion.div
                animate={reduceMotion ? undefined : { y: [0, -5, 0], rotate: [-2, 2, -2] }}
                transition={reduceMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="relative flex size-[4.75rem] items-center justify-center rounded-[1.5rem] border border-[#c7ff00]/25 bg-[#11150b] text-[#c7ff00] shadow-[0_18px_60px_-24px_rgba(199,255,0,.45)]"
              >
                <Mail className="size-9 stroke-[1.4]" />
                <span className="absolute -bottom-2 -right-2 flex size-7 items-center justify-center rounded-xl border border-[#c7ff00]/25 bg-[#171b10]">
                  <Check className="size-3.5" />
                </span>
              </motion.div>
              <span className="absolute right-[calc(50%-4.5rem)] top-4 size-1.5 rounded-full bg-[#c7ff00]/70" />
              <span className="absolute bottom-4 left-[calc(50%-4.75rem)] size-1 rounded-full bg-white/45" />
            </div>
            <div className="mb-5 hidden size-12 items-center justify-center rounded-2xl border border-[#c7ff00]/20 bg-[#c7ff00]/[0.08] text-[#c7ff00] shadow-[0_18px_60px_-30px_rgba(199,255,0,.7)] sm:mb-7 sm:flex sm:size-14 sm:rounded-[1.15rem]">
              {checking ? <Loader2 className="size-6 animate-spin" /> : <MailCheck className="size-6" />}
            </div>

            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.26em] text-[#c7ff00]/75 sm:text-left">
              Verify your email
            </p>
            <h1 className="max-w-lg text-center font-display text-[2.5rem] font-semibold leading-[0.98] tracking-[-0.055em] sm:text-left sm:text-5xl xl:text-6xl">
              {hasSendError ? "Let’s get that link through." : "Check your inbox."}
            </h1>
            <div className="mt-5 flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:mt-7 sm:gap-4 sm:bg-white/[0.035] lg:hidden">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#c7ff00]/[0.09] text-[#c7ff00]">
                <Mail className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-white/45 sm:text-[10px] sm:text-white/35">Sent to</p>
                <p className="break-all text-base font-medium leading-6 text-white/90 sm:text-base">
                  {user.email || "No email address linked"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 text-left text-sm leading-6 text-white/55 sm:mt-4 sm:text-xs sm:leading-5 sm:text-white/45">
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[#c7ff00]/80" />
              <p>
                No email yet? Check Spam or Junk. If it’s there, mark it <span className="text-white/75">Not spam</span>, then open the link.
              </p>
            </div>

            <div
              aria-live="polite"
              role={noticeTone === "error" ? "alert" : "status"}
              className={`mt-4 min-h-5 text-center text-sm leading-6 sm:mt-5 sm:text-left ${
                noticeTone === "error"
                  ? "text-rose-300"
                  : noticeTone === "success"
                    ? "text-[#c7ff00]"
                    : "text-white/45"
              }`}
            >
              {notice || (checking ? "Checking automatically…" : "")}
            </div>

            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_3.5rem] gap-2.5 sm:mt-3 sm:grid-cols-2 sm:gap-3">
              <Button
                onClick={() => void checkVerification(true)}
                disabled={checking}
                className="h-14 min-w-0 rounded-xl bg-[#c7ff00] px-3 text-base font-semibold text-black hover:bg-[#d7ff49] sm:px-4"
              >
                {checking ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4 shrink-0" />}
                <span className="truncate">I’ve verified</span>
              </Button>
              <Button
                onClick={() => void resendEmail()}
                disabled={sending || cooldown > 0 || !user.email}
                aria-label={sending ? "Sending verification link" : cooldown > 0 ? `Resend verification link in ${cooldown} seconds` : "Resend verification link"}
                title={sending ? "Sending verification link" : cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend verification link"}
                variant="outline"
                className="h-14 w-14 min-w-0 rounded-xl border-white/15 bg-white/[0.035] p-0 text-white hover:bg-white/[0.08] hover:text-white sm:w-full sm:px-4"
              >
                {sending ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" />}
                <span className="sr-only sm:not-sr-only sm:truncate">{cooldown > 0 ? `Resend ${cooldown}s` : "Resend link"}</span>
              </Button>
            </div>

          </div>

        </section>
      </div>
    </main>
  );
}