import { createFileRoute, Link } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Flame, Loader2, MailCheck } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firebaseAuth } from "@/integrations/firebase/client";
import { AUTH_EMAIL_SESSION_KEY } from "@/lib/auth-email";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password | Candid" },
      { name: "description", content: "Request a secure link to reset your Candid password." },
    ],
  }),
  component: ForgotPasswordPage,
});

function resetError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/too-many-requests") return "Too many requests. Wait a little and try again.";
  if (code === "auth/network-request-failed") return "Could not reach the sign-in service. Check your connection and try again.";
  return "We couldn’t send the reset link. Check your details and try again.";
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"checking" | "ready" | "missing">("checking");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedEmail = window.sessionStorage.getItem(AUTH_EMAIL_SESSION_KEY)?.trim() ?? "";
      if (savedEmail) {
        setEmail(savedEmail);
        setEmailStatus("ready");
      } else {
        setEmailStatus("missing");
      }
    } catch {
      setEmailStatus("missing");
    }
  }, []);

  async function requestResetLink() {
    setBusy(true);
    setError(null);
    setResent(false);
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      if (sent) setResent(true);
      setSent(true);
    } catch (requestError) {
      setError(resetError(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestResetLink();
  }

  return (
    <div className="auth-screen h-dvh w-full overflow-hidden bg-[#050505] text-[#f5f5f0]">
      <div className="grid h-dvh w-full lg:grid-cols-2">
        <section className="relative hidden overflow-hidden border-r border-white/10 bg-[#0b0d0b] lg:flex lg:flex-col lg:justify-between lg:p-14 xl:p-20">
          <div className="relative z-10 flex items-center gap-3 font-display text-[1.65rem] font-bold tracking-tight">
            <Flame className="size-9 stroke-[2.2] text-[#c7ff00]" />
            <span>Candid<span className="text-[#c7ff00]">.</span></span>
          </div>
          <div className="relative z-10 max-w-xl pb-10">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.3em] text-white/40">Your space is yours</p>
            <h1 className="font-display text-6xl font-semibold leading-[0.96] tracking-[-0.06em] xl:text-7xl">
              Find your way<br /><span className="text-[#c7ff00]">back in.</span>
            </h1>
            <p className="mt-7 max-w-md text-lg leading-8 text-white/50">A secure reset link will get you back to the stories that matter.</p>
          </div>
          <div className="pointer-events-none absolute -bottom-24 -right-20 size-80 rounded-full border border-[#c7ff00]/15 bg-[#c7ff00]/[0.03]" aria-hidden="true" />
        </section>

        <main className="flex h-dvh flex-col px-6 py-5 sm:px-10 sm:py-8 lg:justify-center lg:px-14 lg:py-12 xl:px-20">
          <header className="-mx-6 -mt-5 mb-8 flex w-[calc(100%+3rem)] shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0b0d0b]/80 px-4 py-3.5 backdrop-blur-xl sm:-mx-10 sm:-mt-8 sm:mb-10 sm:w-[calc(100%+5rem)] sm:px-8 lg:hidden">
            <Link
              to="/"
              aria-label="Candid home"
              className="inline-flex items-center gap-2.5 font-display text-xl font-bold tracking-tight"
            >
              <Flame className="size-7 stroke-[2.2] text-[#c7ff00]" />
              <span>Candid<span className="text-[#c7ff00]">.</span></span>
            </Link>
            <Link
              to="/auth"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <ArrowLeft className="size-4" />
              <span>Sign in</span>
            </Link>
          </header>
          <div className="mx-auto w-full max-w-[620px] animate-rise">
            <div className="mb-12 hidden items-center justify-between lg:flex">
              <Link to="/auth" className="inline-flex items-center gap-2 text-sm font-medium text-white/55 transition-colors hover:text-white">
                <ArrowLeft className="size-4" /> Back to sign in
              </Link>
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-white/45">Make it yours.</span>
            </div>

            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">Account access</p>
            <div className="mb-10 mt-5">
              <h1 className="font-display text-[2.8rem] font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl">Forgot your <span className="text-[#c7ff00]">password?</span></h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-white/50 sm:text-lg">Enter your email and we’ll send a secure link to create a new password.</p>
            </div>

            {sent ? (
              <div className="border border-[#c7ff00]/30 bg-[#c7ff00]/[0.06] p-5 sm:p-6">
                <MailCheck className="mb-4 size-6 text-[#c7ff00]" />
                <h2 className="font-display text-xl font-semibold">Check your inbox</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">If an account uses this email, reset instructions are on the way. You can close this page after opening the link.</p>
                {error ? <div role="alert" className="mt-4 border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm leading-5 text-red-200">{error}</div> : null}
                {resent ? <p role="status" className="mt-4 text-sm text-white/55">A new reset link has been sent.</p> : null}
                <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void requestResetLink()}
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#c7ff00] transition-colors hover:text-[#d8ff70] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    {busy ? "Sending another link…" : "Resend reset link"}
                  </button>
                  <Link to="/auth" className="inline-flex items-center gap-2 text-sm font-medium text-[#c7ff00] hover:text-[#d8ff70]">Return to sign in <ArrowRight className="size-4" /></Link>
                </div>
              </div>
            ) : emailStatus === "checking" ? (
              <p role="status" className="text-sm text-white/55">Checking for the email you entered on sign in…</p>
            ) : emailStatus === "missing" ? (
              <div className="border border-white/10 bg-white/[0.03] p-5 sm:p-6">
                <h2 className="font-display text-xl font-semibold">Enter your email first</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  Go to the sign-in screen and enter your email address. You don’t need to submit the form or try to sign in.
                </p>
                <Link
                  to="/auth"
                  className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                  <ArrowLeft className="size-4" />
                  Go to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="max-w-[680px] space-y-7">
                {error ? <div role="alert" className="border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm leading-5 text-red-200">{error}</div> : null}
                <div className="space-y-3">
                  <Label htmlFor="reset-email" className="text-base font-medium sm:text-lg">Email address</Label>
                  <Input id="reset-email" type="email" required autoComplete="email" value={email} onChange={(event) => {
                    const nextEmail = event.target.value;
                    setEmail(nextEmail);
                    try {
                      window.sessionStorage.setItem(AUTH_EMAIL_SESSION_KEY, nextEmail);
                    } catch {
                      // Keep the reset form usable if session storage is unavailable.
                    }
                  }} placeholder="you@example.com" className="h-12 rounded-none border-0 border-b border-white/15 bg-transparent px-0 text-base text-[#f5f5f0] placeholder:text-white/30 shadow-none focus-visible:border-[#c7ff00] focus-visible:ring-0 sm:h-14 sm:text-lg" />
                </div>
                <Button type="submit" disabled={busy} className="h-14 w-full justify-between rounded-lg border-0 bg-[#c7ff00] px-6 text-left text-base font-medium text-black hover:bg-[#d4ff4a] sm:h-16 sm:px-7 sm:text-lg">
                  <span>{busy ? "Sending link…" : "Send reset link"}</span>
                  {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
                </Button>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
