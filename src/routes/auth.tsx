import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  reload,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateEmail,
} from "firebase/auth";
import { notify as toast } from "@/lib/notifications-store";
import { Eye, EyeOff, Flame, Loader2, ShieldCheck } from "lucide-react";
import { firebaseAuth } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { useAuth } from "@/hooks/useAuth";
import { requiresEmailVerification, verificationActionSettings } from "@/lib/email-verification";

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

function authErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function authErrorMessage(error: unknown) {
  const code = authErrorCode(error);
  if (code === "auth/email-already-in-use") {
    return "An account already uses this email. Sign in, or choose Google if that’s how you created it.";
  }
  if (code === "auth/account-exists-with-different-credential") {
    return "This email uses another sign-in method. Sign in with that method first, then connect Google in Settings → Security & access.";
  }
  if (code === "auth/credential-already-in-use") {
    return "That sign-in method is connected to another Candid account. Sign in to the account you want to keep; accounts are not merged automatically.";
  }
  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found"
  ) {
    return "Email or password wasn’t recognized. Check your details, or try Google if you used it to create your account.";
  }
  if (code === "auth/weak-password") return "Choose a password with at least 8 characters.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/network-request-failed") {
    return "Could not reach the sign-in service. Check your connection and try again.";
  }
  if (code === "auth/popup-blocked") {
    return "Your browser blocked the Google sign-in window. Allow popups for Candid, or choose email and password.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This site is not enabled for Firebase sign-in. Add its domain to Firebase Authentication’s authorized domains.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Google sign-in is disabled for this Firebase project. Enable Google in Firebase Authentication sign-in providers.";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const fetchOnboardingState = useServerFn(getOnboardingState);

  useEffect(() => {
    // Do not redirect while a provider popup is still completing. Firebase emits
    // an auth-state update before Google profile data and token claims settle.
    if (authLoading || !user || busy) return;
    if (!user.email) {
      // Firebase can technically create a Google-linked user without an email
      // when the provider response is incomplete. Candid cannot safely use it.
      void signOut(firebaseAuth).then(() => {
        toast.error("This account has no email address attached. Choose a Google account with an email and try again.");
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
    void fetchOnboardingState()
      .then((state) => {
        if (active) void navigate({ to: state.needsOnboarding ? "/onboarding" : "/" });
      })
      .catch(() => {
        if (active) void navigate({ to: "/onboarding" });
      });
    return () => {
      active = false;
    };
  }, [authLoading, user, fetchOnboardingState, navigate, mode, busy]);

  if (authLoading || user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        {user ? "Opening your account…" : "Checking your session…"}
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        try {
          await sendEmailVerification(credential.user, verificationActionSettings());
          window.sessionStorage.setItem("candid:verification-email", "sent");
        } catch (error) {
          window.sessionStorage.setItem("candid:verification-email", "failed");
          console.error("Could not send email verification", error);
          toast.error("Your account is ready, but we couldn’t send the email yet. You can retry on the verification screen.");
        }
        navigate({ to: "/verify-email" });
        return;
      }
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const address = email.trim();
    if (!address) {
      toast.error("Enter your email first so we can send a reset link.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(firebaseAuth, address);
      toast.success(
        "If this email has password sign-in, reset instructions are on the way. If you use Google, choose Continue with Google.",
      );
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("email");
      provider.addScope("profile");
      provider.setCustomParameters({ prompt: "select_account" });
      // This app is hosted on Netlify, not Firebase Hosting. Firebase redirect
      // auth can lose its cross-domain state in modern mobile browsers unless
      // the auth helper is proxied onto this domain. Popup auth avoids that flow.
      const result = await signInWithPopup(firebaseAuth, provider);
      const currentUser = result.user;
      await reload(currentUser);

      // Some OAuth responses expose email on providerData/profile before
      // Firebase has copied it to the User record.
      const additionalInfo = getAdditionalUserInfo(result);
      const profileEmail = additionalInfo?.profile?.["email"];
      const googleEmail =
        currentUser.email ??
        currentUser.providerData.find((item) => item.providerId === "google.com")?.email ??
        (typeof profileEmail === "string" ? profileEmail : null);
      if (!googleEmail) {
        await signOut(firebaseAuth);
        throw new Error(
          "Google did not provide an email address. Choose a Google account with an email and try again.",
        );
      }

      if (!currentUser.email) {
        await updateEmail(currentUser, googleEmail);
      }
      await reload(currentUser);
      await currentUser.getIdToken(true);

      if (!currentUser.emailVerified) {
        try {
          await sendEmailVerification(currentUser, verificationActionSettings());
          window.sessionStorage.setItem("candid:verification-email", "sent");
        } catch (error) {
          window.sessionStorage.setItem("candid:verification-email", "failed");
          console.error("Could not send Google account verification", error);
          toast.error("Verify your email to continue. You can retry on the verification screen.");
        }
        await navigate({ to: "/verify-email" });
        return;
      }

      const state = await fetchOnboardingState({ data: undefined });
      await navigate({ to: state.needsOnboarding ? "/onboarding" : "/" });
    } catch (error) {
      const code = authErrorCode(error);
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        toast.error(authErrorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode: "signin" | "signup") {
    if (nextMode === mode) return;
    setMode(nextMode);
    setPassword("");
    setShowPassword(false);
  }

  return (
    <div className="min-h-dvh w-full bg-background bg-[radial-gradient(ellipse_at_50%_0%,_rgba(132,204,22,0.09),_transparent_42%)] dark:bg-[radial-gradient(ellipse_at_50%_0%,_rgba(190,242,100,0.11),_transparent_34%),linear-gradient(155deg,#121411_0%,#0b0c0b_52%,#11120f_100%)] md:h-dvh md:overflow-hidden">
      <div className="relative min-h-dvh w-full overflow-hidden border-0 bg-transparent shadow-none md:h-dvh md:min-h-0 md:bg-card/70 md:shadow-2xl md:backdrop-blur-xl">
        <div className="grid min-h-dvh md:h-dvh md:min-h-0 md:grid-cols-2">
          <div className="relative hidden overflow-hidden border-r border-border bg-secondary/40 dark:bg-[radial-gradient(ellipse_at_30%_28%,_rgba(190,242,100,0.14),_transparent_34%),linear-gradient(145deg,#171b14_0%,#111512_48%,#171713_100%)] md:flex md:h-dvh md:items-center md:justify-center md:p-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="relative w-full max-w-xl space-y-7"
            >
              <div className="flex items-center gap-3 text-foreground">
                <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_35px_-12px_rgba(190,242,100,0.35)]">
                  <Flame className="size-5" />
                </span>
                <span className="font-display text-xl font-semibold tracking-tight">Candid</span>
              </div>
              <div className="space-y-4">
                <h2 className="max-w-lg font-display text-5xl font-semibold leading-[1.08] tracking-tight text-foreground">
                  Know what you&apos;re walking into.
                </h2>
                <p className="max-w-md text-base leading-7 text-muted-foreground">
                  Straight stories about pay, respect and what a job is really like.
                </p>
              </div>
              <div className="flex items-center gap-3 pt-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 shrink-0 text-primary" />
                <span>Stories from people who have done the work.</span>
              </div>
            </motion.div>
          </div>

          <div className="flex min-h-dvh flex-col justify-start px-5 pb-8 pt-6 sm:px-8 md:h-dvh md:min-h-0 md:justify-center md:overflow-y-auto md:px-10 md:py-10">
            <div className="mx-auto w-full animate-rise md:max-w-[25rem]">
              <Link
                to="/"
                className="mb-7 inline-flex items-center gap-3 font-display text-xl font-semibold tracking-tight text-foreground md:hidden"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_32px_-12px_rgba(190,242,100,0.7)]">
                  <Flame className="size-6" />
                </span>
                Candid
              </Link>
              <div className="rounded-none border-0 bg-transparent p-0 shadow-none md:rounded-[1.75rem] md:border md:border-border md:bg-card/75 md:p-8 md:shadow-xl">
                <div className="mb-6">
                  <h1 className="font-display text-[2rem] font-semibold tracking-tight text-foreground">
                    {mode === "signin" ? "Welcome back" : "Join Candid"}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {mode === "signin"
                      ? "Pick up where you left off."
                      : "A better read on work starts here."}
                  </p>
                </div>

                <div
                  role="tablist"
                  aria-label="Choose sign in or account creation"
                  className="mb-5 grid grid-cols-2 rounded-2xl border border-border bg-secondary/60 p-1"
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
                      className={`relative isolate min-h-11 rounded-[0.8rem] px-3 text-sm font-medium transition-colors duration-200 ${mode === tabMode ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {mode === tabMode ? (
                        <motion.span
                          layoutId="auth-mode-pill"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                          className="absolute inset-0 -z-10 rounded-[0.8rem] border border-border bg-background shadow-sm"
                        />
                      ) : null}
                      {label}
                    </button>
                  ))}
                </div>

                <div id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${mode}`}>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={googleSignIn}
                    className="h-12 w-full rounded-xl border-border bg-card font-medium text-foreground shadow-none transition-all hover:border-primary/40 hover:bg-secondary active:scale-[0.99]"
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <svg className="size-[18px]" viewBox="0 0 24 24" aria-hidden>
                        <path
                          fill="#4285F4"
                          d="M21.6 12.23c0-.75-.07-1.47-.2-2.16H12v4.09h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.45Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 22c2.7 0 4.96-.9 6.61-2.42l-3.23-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M6.41 13.92a6 6 0 0 1 0-3.83V7.5H3.07a10 10 0 0 0 0 9l3.34-2.58Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.99 14.7 2 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59C7.2 7.73 9.4 5.98 12 5.98Z"
                        />
                      </svg>
                    )}
                    Continue with Google
                  </Button>

                  <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground/75">
                    <span className="h-px flex-1 bg-border" />
                    or use email
                    <span className="h-px flex-1 bg-border" />
                  </div>

                  <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-[13px] font-medium text-foreground">
                        Email address
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        className="h-12 rounded-xl border-input bg-background px-4 text-[15px] text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/45 focus-visible:ring-primary/20 dark:bg-white/[0.035] dark:shadow-inner dark:shadow-black/10"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-[13px] font-medium text-foreground">
                          Password
                        </Label>
                        {mode === "signin" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void resetPassword()}
                            className="text-xs font-medium text-primary/90 transition-colors hover:text-primary disabled:opacity-50"
                          >
                            Forgot password?
                          </button>
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
                          className="h-12 rounded-xl border-input bg-background px-4 pr-12 text-[15px] text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/45 focus-visible:ring-primary/20 dark:bg-white/[0.035] dark:shadow-inner dark:shadow-black/10"
                        />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((visible) => !visible)}
                        className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
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
                      className="mt-1 h-12 w-full rounded-xl font-semibold shadow-[0_10px_30px_-15px_rgba(190,242,100,0.7)] transition-all hover:brightness-105 active:scale-[0.99]"
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      {mode === "signin" ? "Sign in" : "Create account"}
                    </Button>
                  </form>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
