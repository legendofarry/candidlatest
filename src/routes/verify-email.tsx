import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Loader2, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { reload, sendEmailVerification, signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { firebaseAuth } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/useAuth";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { requiresEmailVerification, verificationActionSettings } from "@/lib/email-verification";
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

function VerifyEmailPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const readOnboarding = useServerFn(getOnboardingState);
  const finishing = useRef(false);
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [notice, setNotice] = useState("");
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
      setNotice("Your email is confirmed. We couldn’t open your account yet; try again in a moment.");
    }
  }, [navigate, readOnboarding]);

  const checkVerification = useCallback(async (manual = false) => {
    if (manual) {
      setNotice("");
    }
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
        toast.info("Nice try 😄", {
          description: "Your inbox hasn’t given us the green light yet. Tap the link in your email, then try again.",
          duration: 4500,
        });
      }
    } catch {
      setChecking(false);
      setNotice("We couldn’t check your email status. Check your connection and try again.");
    }
  }, [continueIntoApp, navigate]);

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
    const timer = window.setInterval(() => void checkVerification(), 3500);
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
    if (sendStatus === "sent") setNotice("Verification email sent. Check your inbox.");
    if (sendStatus === "failed") setNotice("We couldn’t send the email. Check your connection, then retry below.");
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
      setNotice("This account has no email address. Sign out and use an email or Google account to continue.");
      return;
    }
    setSending(true);
    setNotice("");
    try {
      await sendEmailVerification(current, verificationActionSettings());
      setCooldown(30);
      setNotice("A fresh verification link is on its way.");
      toast.success("Verification email sent.");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      setNotice(
        code === "auth/too-many-requests"
          ? "Too many emails were requested. Wait a little, then try again."
          : "We couldn’t send the email. Check your connection and try again.",
      );
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
      <main className="flex min-h-dvh w-full items-center justify-center bg-background px-6 text-foreground">
        <Loader2 className="mr-3 size-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">{verified ? "Email confirmed. Opening Candid…" : "Checking your account…"}</span>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background px-5 py-8 text-foreground before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_50%_0%,_hsl(var(--primary)/0.12),_transparent_55%)]">
      <section className="relative w-full max-w-lg">
        <Link to="/" className="mb-12 inline-flex items-center gap-3 font-display text-xl font-semibold tracking-tight">
          <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <Flame className="size-5" />
          </span>
          Candid
        </Link>

        <div className="mb-8 flex size-16 items-center justify-center rounded-[1.4rem] border border-primary/25 bg-primary/10 text-primary shadow-[0_16px_50px_-24px_hsl(var(--primary)/0.7)]">
          {checking ? <Loader2 className="size-7 animate-spin" /> : <MailCheck className="size-7" />}
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">One quick check</p>
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          {user.email ? "Check your inbox" : "Use an email account"}
        </h1>
        <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
          {user.email
            ? "Use the verification link in your inbox. Open it on this device or another one; this screen will notice when you’re verified."
            : "Candid requires a verified email before you can continue. Sign out, then use Google or an email-and-password account."}
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
          <p className="break-all font-medium">{user.email || "No email address linked"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.email ? "Check your spam folder if it doesn’t arrive soon." : "Use another account to continue."}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => void checkVerification(true)} disabled={checking} className="h-12 flex-1 rounded-xl">
            {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            I’ve verified my email
          </Button>
          <Button onClick={() => void resendEmail()} disabled={sending || cooldown > 0 || !user.email} variant="outline" className="h-12 rounded-xl">
            {sending ? <Loader2 className="size-4 animate-spin" /> : null}
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
          </Button>
        </div>

        <div aria-live="polite" className="mt-4 min-h-6 text-sm text-muted-foreground">
          {notice || (checking ? "Checking automatically…" : "Still waiting for confirmation.")}
        </div>

        <p className="mt-8 flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          Your email stays private. It is only used to protect Candid from spam and duplicate accounts.
        </p>

        <button type="button" onClick={() => void useAnotherAccount()} className="mt-8 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Sign out and use another account
        </button>
      </section>
    </main>
  );
}
