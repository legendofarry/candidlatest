import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
} from "firebase/auth";
import { notify as toast } from "@/lib/notifications-store";
import { Building2, Eye, EyeOff, Flame, Loader2, MessageSquareText, ShieldCheck, UserRound } from "lucide-react";
import { firebaseAuth } from "@/integrations/firebase/client";
import { AUTH_EMAIL_SESSION_KEY } from "@/lib/auth-email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { changeMyAccountLifecycle, getMyAccountLifecycle } from "@/lib/account-lifecycle.functions";
import { useAuth } from "@/hooks/useAuth";
import {
  firebaseAuthErrorCode,
  requiresEmailVerification,
  verificationActionSettings,
  verificationEmailErrorMessage,
} from "@/lib/email-verification";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | Candid" },
      {
        name: "description",
        content:
          "Create a Candid account to share workplace stories, vote and comment. Your Candid handle appears publicly; your email and legal name do not.",
      },
      { property: "og:title", content: "Sign in | Candid" },
      {
        property: "og:description",
        content: "Accounts help keep the platform reliable. Your email and legal name stay private.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function MobileAuthVisual() {
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;

  return (
    <div
      aria-hidden="true"
      className="relative isolate flex min-h-40 flex-1 items-center justify-center overflow-hidden lg:hidden"
    >
      <div className="absolute inset-x-5 top-1/2 -z-10 h-px bg-gradient-to-r from-transparent via-[#c7ff00]/20 to-transparent" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_52%,_rgba(199,255,0,0.055),_transparent_58%)]" />

      <div className="relative flex size-[clamp(9rem,46vw,16rem)] items-center justify-center">
        <motion.div
          animate={animate ? { rotate: 360 } : undefined}
          transition={animate ? { duration: 34, repeat: Infinity, ease: "linear" } : undefined}
          className="absolute inset-0 rounded-full border border-dashed border-[#c7ff00]/20"
        >
          <span className="absolute left-[16%] top-[18%] size-2 rounded-full bg-[#c7ff00] shadow-[0_0_18px_5px_rgba(199,255,0,.24)]" />
          <span className="absolute bottom-[13%] right-[12%] size-1.5 rounded-full bg-teal-300/80 shadow-[0_0_16px_4px_rgba(94,234,212,.22)]" />
        </motion.div>
        <div className="absolute inset-[12%] rounded-full border border-white/[0.07]" />
        <motion.div
          animate={animate ? { scale: [1, 1.045, 1] } : undefined}
          transition={animate ? { duration: 4.5, repeat: Infinity, ease: "easeInOut" } : undefined}
          className="relative flex size-[4.25rem] items-center justify-center rounded-[1.4rem] border border-[#c7ff00]/25 bg-[#10140a] text-[#c7ff00] shadow-[0_0_65px_-22px_rgba(199,255,0,.42)]"
        >
          <MessageSquareText className="size-7 stroke-[1.5]" />
          <span className="absolute -bottom-2 -right-2 flex size-7 items-center justify-center rounded-xl border border-teal-300/25 bg-[#0b1110] text-teal-200">
            <ShieldCheck className="size-4" />
          </span>
        </motion.div>
      </div>

      <div className="absolute inset-x-1 bottom-3 flex items-center justify-center gap-2.5 text-[9px] font-medium uppercase tracking-[0.2em] text-white/35">
        <span>Kenyan voices</span>
        <span className="size-1 rounded-full bg-[#c7ff00]/70" />
        <span>Private by design</span>
      </div>
    </div>
  );
}

function authErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function authErrorMessage(error: unknown) {
  const code = authErrorCode(error);
  if (code === "auth/email-already-in-use") {
    return "An account already uses this email. Sign in with its password or contact Candid support to recover access.";
  }
  if (code === "auth/account-exists-with-different-credential") {
    return "This email is already linked to another sign-in method. Contact Candid support to recover access.";
  }
  if (code === "auth/credential-already-in-use") {
    return "That sign-in method is connected to another Candid account. Sign in to the account you want to keep; accounts are not merged automatically.";
  }
  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found"
  ) {
    return "Email or password wasn’t recognized. Check your details and try again.";
  }
  if (code === "auth/weak-password") return "Choose a password with at least 8 characters.";
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Wait a little and try again.";
  }
  if (code === "auth/user-disabled") {
    return "This account is disabled. Contact Candid support for help.";
  }
  if (code === "auth/invalid-login-credentials") {
    return "Email or password wasn’t recognized. Check your details and try again.";
  }
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/network-request-failed") {
    return "Could not reach the sign-in service. Check your connection and try again.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This site is not enabled for Firebase sign-in. Add its domain to Firebase Authentication’s authorized domains.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Email and password sign-in is disabled for this Firebase project. Enable it in Firebase Authentication sign-in providers.";
  }
  if (code === "auth/invalid-api-key" || code === "auth/app-not-authorized") {
    return "This app’s Firebase sign-in configuration is invalid. Check the Firebase web app and API key settings.";
  }
  if (code === "auth/web-storage-unsupported") {
    return "This browser is blocking the storage needed for sign-in. Enable site storage or try another browser.";
  }
  return error instanceof Error ? error.message : "Sign-in failed. Please try again.";
}

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signupAccountType, setSignupAccountType] = useState<"individual" | "company">("individual");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const fetchOnboardingState = useServerFn(getOnboardingState);
  const fetchLifecycle = useServerFn(getMyAccountLifecycle);
  const changeLifecycle = useServerFn(changeMyAccountLifecycle);

  useEffect(() => {
    try {
      setEmail(window.sessionStorage.getItem(AUTH_EMAIL_SESSION_KEY) ?? "");
    } catch {
      // Session storage can be unavailable in restricted browser contexts.
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user || busy || accountError) return;
    if (!user.email) {
      void signOut(firebaseAuth).then(() => {
        toast.error("This account has no email address attached. Contact Candid support for help signing in.");
      });
      return;
    }
    // Let the signup handler finish requesting the verification email before
    // auth-state redirects replace this screen.
    if (mode === "signup" && busy) return;
    if (requiresEmailVerification(user)) {
      void navigate({ to: "/verify-email" });
      return;
    }
    let active = true;
    // A paused account resumes the moment its owner logs back in.
    void fetchLifecycle()
      .then(async (lifecycle) => {
        if (lifecycle.status === "deactivated") {
          await changeLifecycle({ data: { action: "reactivate" } });
          toast.success("Welcome back. Your account is active again.");
        }
        return fetchOnboardingState();
      })
      .then((state) => {
        if (active) void navigate({ to: state.needsOnboarding ? "/onboarding" : "/" });
      })
      .catch((error: unknown) => {
        console.error("Signed in, but Candid could not load the account profile", error);
        if (active) {
          setAccountError(
            "You’re signed in, but Candid couldn’t load your account. Check your connection and try again.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [authLoading, user, fetchOnboardingState, fetchLifecycle, changeLifecycle, navigate, mode, busy, accountError]);

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Checking your session…
      </div>
    );
  }

  if (user) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-5 text-foreground">
        <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
          {accountError ? (
            <>
              <h1 className="text-xl font-semibold">You’re signed in</h1>
              <p role="alert" className="mt-3 text-sm leading-6 text-muted-foreground">{accountError}</p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={() => setAccountError(null)}>Try again</Button>
                <Button variant="outline" onClick={() => void signOut(firebaseAuth)}>Sign out</Button>
              </div>
            </>
          ) : (
            <p className="flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Opening your account…
            </p>
          )}
        </section>
      </main>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setAuthError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        window.sessionStorage.setItem("candid:signup-account-type", signupAccountType);
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
        try {
          await sendEmailVerification(credential.user, verificationActionSettings());
          window.sessionStorage.setItem("candid:verification-email", "sent");
        } catch (error) {
          const code = firebaseAuthErrorCode(error);
          window.sessionStorage.setItem(
            "candid:verification-email",
            code ? `failed:${code}` : "failed",
          );
          console.error("Could not send email verification", code || error);
          toast.error("Your account is ready, but the verification email could not be requested.", {
            description: verificationEmailErrorMessage(error),
          });
        }
        navigate({ to: "/verify-email" });
        return;
      }
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    } catch (error) {
      setAuthError(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode: "signin" | "signup") {
    if (nextMode === mode) return;
    setMode(nextMode);
    setPassword("");
    setShowPassword(false);
    setAuthError(null);
  }

  return (
    <div className="auth-screen h-dvh w-full overflow-hidden bg-[#050505] text-[#f5f5f0]">
      <div className="relative h-dvh w-full overflow-hidden bg-[#050505]">
        <div className="grid h-dvh min-h-0 w-full lg:grid-cols-2">
          <section className="relative hidden h-dvh min-h-0 overflow-hidden border-r border-white/10 bg-[#0b0d0b] lg:flex lg:flex-col lg:justify-between lg:p-14 xl:p-20">
            <div className="relative z-10 flex items-center gap-3 font-display text-[1.65rem] font-bold tracking-tight">
              <Flame className="size-9 stroke-[2.2] text-[#c7ff00]" />
              <span>Candid<span className="text-[#c7ff00]">.</span></span>
            </div>
            <div className="relative z-10 max-w-xl pb-10">
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.3em] text-white/40">A clearer view of work</p>
              <h2 className="font-display text-6xl font-semibold leading-[0.96] tracking-[-0.06em] text-[#f5f5f0] xl:text-7xl">
                Know what you&apos;re walking into<span className="text-[#c7ff00]">.</span>
              </h2>
              <p className="mt-7 max-w-md text-lg leading-8 text-white/50">
                Real workplace stories, shared safely by the people who lived them.
              </p>
            </div>
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <motion.div
                animate={{ y: [0, -18, 0], rotate: [0, 4, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                className="absolute left-[18%] top-[27%] size-56 rounded-[3rem] border border-[#c7ff00]/20 bg-[#c7ff00]/[0.04] shadow-[0_0_100px_-30px_#c7ff00]"
              />
              <motion.div
                animate={{ y: [0, 24, 0], x: [0, 10, 0] }}
                transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-24 -right-20 size-80 rounded-full border border-[#c7ff00]/15 bg-[#c7ff00]/[0.03]"
              />
              <div className="absolute right-[17%] top-[34%] size-3 rounded-full bg-[#c7ff00] shadow-[0_0_24px_8px_rgba(199,255,0,0.22)]" />
              <div className="absolute bottom-[24%] left-[12%] h-px w-28 bg-[#c7ff00]/40" />
            </div>
          </section>

          <main className="flex h-dvh min-h-0 flex-col overflow-y-auto overscroll-contain px-6 py-5 sm:px-10 sm:py-8 lg:justify-center lg:px-14 lg:py-12 xl:px-20">
            <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-[620px] flex-col animate-rise sm:min-h-[calc(100dvh-4rem)] lg:my-auto lg:min-h-0">
              <div className="mb-7 flex items-center sm:mb-10 lg:hidden">
                <Link
                  to="/"
                  className="inline-flex items-center gap-3 font-display text-[1.65rem] font-bold tracking-tight text-[#f5f5f0]"
                >
                  <Flame className="size-9 stroke-[2.2] text-[#c7ff00]" />
                  <span>Candid<span className="text-[#c7ff00]">.</span></span>
                </Link>
              </div>
              <div className="max-w-[700px]">
                <h1 className="mb-6 font-display text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#f5f5f0] lg:hidden">
                  {mode === "signin" ? "Good to have you back" : "Create your account"}
                </h1>

                <div
                  role="tablist"
                  aria-label="Choose sign in or account creation"
                  className="mb-6 grid max-w-[680px] grid-cols-2 border-b border-white/15 sm:mb-8"
                >
                  {([
                    ["signin", "Sign in"],
                    ["signup", "Create account"],
                  ] as const).map(([tabMode, label]) => (
                    <button
                      key={tabMode}
                      id={`auth-tab-${tabMode}`}
                      type="button"
                      role="tab"
                      aria-selected={mode === tabMode}
                      aria-controls="auth-panel"
                      onClick={() => switchMode(tabMode)}
                      className={`relative min-h-14 px-3 text-base font-medium transition-colors duration-200 ${mode === tabMode ? "text-[#c7ff00]" : "text-white/45 hover:text-white/80"}`}
                    >
                      {mode === tabMode ? (
                        <motion.span
                          layoutId="auth-mode-pill"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                          className="absolute inset-x-0 bottom-[-1px] -z-10 h-[3px] bg-[#c7ff00]"
                        />
                      ) : null}
                      {label}
                    </button>
                  ))}
                </div>

                <div id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${mode}`}>
                  {authError ? (
                    <div role="alert" className="mb-6 border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm leading-5 text-red-200">
                      {authError}
                    </div>
                  ) : null}
                  <form onSubmit={submit} className="max-w-[680px] space-y-6 sm:space-y-8">
                    {mode === "signup" ? (
                      <fieldset className="space-y-3">
                        <legend className="text-base font-medium text-[#f5f5f0] sm:text-lg">What kind of account are you creating?</legend>
                        <div className="grid grid-cols-2 gap-3">
                          {([
                            ["individual", "Individual", "Share as a worker", UserRound],
                            ["company", "Company", "Represent an employer", Building2],
                          ] as const).map(([value, title, description, Icon]) => (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={signupAccountType === value}
                              onClick={() => setSignupAccountType(value)}
                              className={`min-h-28 border px-4 py-4 text-left transition-colors ${signupAccountType === value ? "border-[#c7ff00]/70 bg-[#c7ff00]/[0.07]" : "border-white/15 bg-white/[0.02] hover:border-white/30"}`}
                            >
                              <Icon className={`size-5 ${signupAccountType === value ? "text-[#c7ff00]" : "text-white/55"}`} />
                              <span className="mt-3 block text-sm font-semibold text-[#f5f5f0]">{title}</span>
                              <span className="mt-1 block text-xs leading-5 text-white/45">{description}</span>
                            </button>
                          ))}
                        </div>
                        {signupAccountType === "company" ? (
                          <p className="text-xs leading-5 text-white/45">Company accounts can read public stories. Claiming a company page requires review; official contributions require verification and Premium.</p>
                        ) : null}
                      </fieldset>
                    ) : null}
                    <div className="space-y-3">
                      <Label htmlFor="email" className="text-base font-medium text-[#f5f5f0] sm:text-lg">
                        Email address
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(event) => {
                          const nextEmail = event.target.value;
                          setEmail(nextEmail);
                          try {
                            if (nextEmail) window.sessionStorage.setItem(AUTH_EMAIL_SESSION_KEY, nextEmail);
                            else window.sessionStorage.removeItem(AUTH_EMAIL_SESSION_KEY);
                          } catch {
                            // Keep the sign-in form usable if session storage is unavailable.
                          }
                        }}
                        placeholder="you@example.com"
                        className="h-12 rounded-none border-0 border-b border-white/15 bg-transparent px-0 text-base text-[#f5f5f0] placeholder:text-white/30 shadow-none focus-visible:border-[#c7ff00] focus-visible:ring-0 sm:h-14 sm:text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-base font-medium text-[#f5f5f0] sm:text-lg">
                          Password
                        </Label>
                        {mode === "signin" ? (
                          <Link
                            to="/forgot-password"
                            className="text-sm font-medium text-[#c7ff00] transition-colors hover:text-[#d8ff70]"
                          >
                            Forgot password?
                          </Link>
                        ) : null}
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={8}
                          autoComplete={mode === "signup" ? "new-password" : "current-password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                          className="h-12 rounded-none border-0 border-b border-white/15 bg-transparent px-0 pr-12 text-base text-[#f5f5f0] placeholder:text-white/30 shadow-none focus-visible:border-[#c7ff00] focus-visible:ring-0 sm:h-14 sm:text-lg"
                        />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((visible) => !visible)}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white/50 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7ff00]"
                      >
                        {showPassword ? (
                          <EyeOff className="size-[18px]" />
                        ) : (
                          <Eye className="size-[18px]" />
                        )}
                      </button>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={busy}
                      className="mt-1 h-14 w-full justify-between rounded-lg border-0 bg-[#c7ff00] px-6 text-left text-base font-medium text-black shadow-[0_12px_40px_-22px_#c7ff00] transition-all hover:bg-[#d4ff4a] active:scale-[0.99] sm:h-16 sm:px-7 sm:text-lg"
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      <span>{mode === "signin" ? "Sign in" : "Create account"}</span>
                      {!busy ? <span aria-hidden className="text-3xl leading-none">→</span> : null}
                    </Button>
                  </form>
                </div>

              </div>
              <MobileAuthVisual />
              <footer className="mt-auto flex max-w-[680px] flex-col gap-3 pt-8 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:pt-14 sm:text-sm lg:mt-8 lg:pt-0 xl:mt-14">
                <p className="flex items-center gap-3"><span aria-hidden>⌑</span> Your space. Safe and secure.</p>
                <div className="flex items-center gap-5"><span>© 2026 Candid</span><Link to="/privacy" className="hover:text-white">Privacy</Link><Link to="/guidelines" className="hover:text-white">Terms</Link></div>
              </footer>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
