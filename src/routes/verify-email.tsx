import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  Check,
  Flame,
  Loader2,
  Mail,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { reload, sendEmailVerification, signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
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
      setNotice("We asked Firebase to send your verification link. Check your inbox and Spam or Junk.");
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
      setNotice("Firebase accepted the request. Check your inbox, Spam, and Junk folders.");
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
    <main className="relative isolate min-h-dvh overflow-hidden bg-[#050505] text-[#f5f5f0]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_8%,_rgba(199,255,0,0.10),_transparent_36%),radial-gradient(ellipse_at_0%_100%,_rgba(0,197,180,0.08),_transparent_42%)]"
      />
      <div className="relative grid min-h-dvh lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <aside className="relative hidden min-h-dvh flex-col justify-between overflow-hidden border-r border-white/10 bg-[#090b09] px-10 py-9 lg:flex xl:px-16 xl:py-12">
          <Link
            to="/"
            className="relative z-10 inline-flex w-fit items-center gap-3 font-display text-2xl font-bold tracking-tight"
          >
            <Flame className="size-8 stroke-[2.2] text-[#c7ff00]" />
            <span>Candid<span className="text-[#c7ff00]">.</span></span>
          </Link>

          <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col items-center pb-8 text-center">
            <div className="relative mb-12 flex size-64 items-center justify-center">
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
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-[#c7ff00]/70">
              One last step
            </p>
            <h2 className="max-w-md font-display text-5xl font-semibold leading-[1.02] tracking-[-0.05em] xl:text-6xl">
              Your voice starts with a verified inbox<span className="text-[#c7ff00]">.</span>
            </h2>
            <p className="mt-5 max-w-sm text-base leading-7 text-white/45">
              Confirm your email to keep your account safe and continue to Candid.
            </p>
          </div>

          <p className="relative z-10 flex items-center gap-2 text-xs text-white/40">
            <ShieldCheck className="size-4 text-[#c7ff00]/75" />
            Your email stays private and is never shown on your stories.
          </p>
          <div aria-hidden="true" className="absolute -bottom-40 -left-24 size-80 rounded-full border border-[#c7ff00]/10" />
        </aside>

        <section className="flex min-h-dvh flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:py-8 lg:px-12 xl:px-20">
          <header className="flex items-center justify-between lg:justify-end">
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight lg:hidden"
            >
              <Flame className="size-6 stroke-[2.2] text-[#c7ff00]" />
              <span>Candid<span className="text-[#c7ff00]">.</span></span>
            </Link>
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Account setup <span className="mx-1.5 text-[#c7ff00]">·</span> 01 / 01
            </span>
          </header>

          <div className="mx-auto flex w-full max-w-[540px] flex-1 flex-col justify-center py-6 sm:py-10 lg:py-12">
            <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-[#c7ff00]/20 bg-[#c7ff00]/[0.08] text-[#c7ff00] shadow-[0_18px_60px_-30px_rgba(199,255,0,.7)] sm:mb-7 sm:size-14 sm:rounded-[1.15rem]">
              {checking ? <Loader2 className="size-6 animate-spin" /> : <MailCheck className="size-6" />}
            </div>

            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-[#c7ff00]/75 sm:text-xs">
              Verify your email
            </p>
            <h1 className="max-w-lg font-display text-[2.45rem] font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl xl:text-6xl">
              {hasSendError ? "Let’s get that link through." : "Check your inbox."}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/50 sm:mt-4 sm:text-base sm:leading-7">
              {hasSendError
                ? "Your account is ready, but Firebase did not accept the verification email request. Use the guidance below and try again."
                : "Confirm your email to finish setting up your Candid account. We’ll take you straight in once it’s verified."}
            </p>

            <div className="mt-5 flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 sm:mt-7 sm:gap-4 sm:p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#c7ff00]/[0.09] text-[#c7ff00]">
                <Mail className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">Sent to</p>
                <p className="break-all text-sm font-medium text-white/90 sm:text-base">
                  {user.email || "No email address linked"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-xs leading-5 text-white/45 sm:mt-4 sm:px-4">
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[#c7ff00]/80" />
              <p>
                No email yet? Check Spam or Junk. If it’s there, mark it <span className="text-white/75">Not spam</span>, then open the link.
              </p>
            </div>

            <div
              aria-live="polite"
              role={noticeTone === "error" ? "alert" : "status"}
              className={`mt-4 min-h-5 text-xs leading-5 sm:mt-5 sm:text-sm ${
                noticeTone === "error"
                  ? "text-rose-300"
                  : noticeTone === "success"
                    ? "text-[#c7ff00]"
                    : "text-white/45"
              }`}
            >
              {notice || (checking ? "Checking automatically…" : "We’ll keep checking while you look.")}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2.5 sm:mt-3 sm:gap-3">
              <Button
                onClick={() => void checkVerification(true)}
                disabled={checking}
                className="h-12 min-w-0 rounded-xl bg-[#c7ff00] px-2 text-sm font-semibold text-black hover:bg-[#d7ff49] sm:h-14 sm:px-4 sm:text-base"
              >
                {checking ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4 shrink-0" />}
                <span className="truncate">I’ve verified</span>
              </Button>
              <Button
                onClick={() => void resendEmail()}
                disabled={sending || cooldown > 0 || !user.email}
                variant="outline"
                className="h-12 min-w-0 rounded-xl border-white/15 bg-white/[0.035] px-2 text-sm text-white hover:bg-white/[0.08] hover:text-white sm:h-14 sm:px-4 sm:text-base"
              >
                {sending ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <RefreshCw className="size-4 shrink-0" />}
                <span className="truncate">{cooldown > 0 ? `Resend ${cooldown}s` : "Resend link"}</span>
              </Button>
            </div>

            <button
              type="button"
              onClick={() => void useAnotherAccount()}
              className="mt-5 inline-flex w-fit items-center gap-2 text-xs text-white/45 transition-colors hover:text-white sm:mt-6 sm:text-sm"
            >
              <span>Sign out and use another account</span>
              <ArrowRight className="size-3.5" />
            </button>
          </div>

          <footer className="mx-auto flex w-full max-w-[540px] items-center gap-2 border-t border-white/[0.08] pt-3 text-[10px] leading-4 text-white/30 sm:pt-4 sm:text-xs">
            <ShieldCheck className="size-3.5 shrink-0 text-[#c7ff00]/60" />
            Your email is private. Your Candid handle is what appears publicly.
          </footer>
        </section>
      </div>
    </main>
  );
}
