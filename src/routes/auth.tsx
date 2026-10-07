import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";
import { notify as toast } from "@/lib/notifications-store";
import { EyeOff, Fingerprint, Flame, Loader2, ShieldCheck } from "lucide-react";
import { authenticateWithBiometric, getCredentials, markUnlocked } from "@/lib/biometrics";
import { firebaseAuth } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in anonymously | Candid" },
      {
        name: "description",
        content:
          "Create a free Candid account to post exit stories, vote and comment. Your name and email are never shown — you appear only as an anonymous handle.",
      },
      { property: "og:title", content: "Sign in anonymously | Candid" },
      {
        property: "og:description",
        content: "Accounts keep the platform honest. Your identity stays hidden from everyone.",
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
  const [busy, setBusy] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const fetchOnboardingState = useServerFn(getOnboardingState);

  useEffect(() => {
    if (authLoading || !user) return;
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
  }, [authLoading, user, fetchOnboardingState, navigate]);

  useEffect(() => {
    setHasBiometric(getCredentials().length > 0);
  }, []);

  if (authLoading || user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        {user ? "Opening your account…" : "Checking your session…"}
      </div>
    );
  }

  async function biometricUnlock() {
    setBusy(true);
    const ok = await authenticateWithBiometric();
    setBusy(false);
    if (ok) {
      markUnlocked();
      toast.success("Welcome back.");
      navigate({ to: "/" });
    } else {
      toast.error("Scan not recognised. Use your email and password.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(firebaseAuth, email, password);
        toast.success("Account created.");
        navigate({ to: "/onboarding" });
        return;
      }
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      toast.success("Signed in. You are anonymous to everyone else.");
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
      provider.setCustomParameters({ prompt: "select_account" });
      // This app is hosted on Netlify, not Firebase Hosting. Firebase redirect
      // auth can lose its cross-domain state in modern mobile browsers unless
      // the auth helper is proxied onto this domain. Popup auth avoids that flow.
      const result = await signInWithPopup(firebaseAuth, provider);
      const isNewUser = getAdditionalUserInfo(result)?.isNewUser ?? false;
      toast.success(
        isNewUser
          ? "Account created with Google. Your identity stays private."
          : "Signed in with Google.",
      );
    } catch (error) {
      const code = authErrorCode(error);
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        toast.error(authErrorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,_rgba(134,239,172,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.18),_transparent_28%),hsl(var(--background))] md:h-dvh md:overflow-hidden">
      <div className="relative min-h-screen w-full overflow-hidden border-0 bg-transparent shadow-none md:h-dvh md:min-h-0 md:bg-card/80 md:shadow-2xl md:backdrop-blur-xl">
        <div className="grid min-h-dvh md:h-dvh md:min-h-0 md:grid-cols-2">
          <div className="relative hidden overflow-hidden border-r border-border/80 bg-[linear-gradient(135deg,#10251d_0%,#13212b_52%,#22271f_100%)] md:flex md:h-dvh md:items-center md:justify-center md:p-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="relative w-full max-w-xl space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-emerald-200">
                <EyeOff className="size-3.5" />
                Anonymous by design
              </div>
              <div className="space-y-4">
                <h2 className="max-w-md text-4xl font-semibold tracking-tight text-white">
                  Your story is honest. Your identity stays private.
                </h2>
                <p className="max-w-md text-base text-slate-200/80">
                  Keep the platform honest without exposing your workplace, name or email.
                </p>
              </div>
              <motion.div
                className="flex gap-3 text-sm text-slate-100/80"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                  100% anonymous
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                  Verified by design
                </div>
              </motion.div>
              <div className="mt-7 flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 p-4 text-emerald-100/90">
                <ShieldCheck className="size-5 shrink-0" />
                <span className="text-sm">Your email stays private. Your voice stays heard.</span>
              </div>
            </motion.div>
          </div>

          <div className="flex items-start justify-center px-5 pb-8 pt-4 md:h-dvh md:items-center md:overflow-y-auto md:p-10">
            <div className="w-full max-w-md animate-rise">
              <Link
                to="/"
                className="mb-5 inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground md:mb-8 md:hidden"
              >
                <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <Flame className="size-5" />
                </span>
                Candid
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  · anonymous by design
                </span>
              </Link>
              <div className="rounded-none border-0 bg-transparent p-0 shadow-none md:rounded-3xl md:border md:border-border md:bg-background/80 md:p-8 md:shadow-xl">
                <div className="flex items-center gap-2 text-primary">
                  <EyeOff className="size-5" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {mode === "signin" ? "Welcome back" : "Create your account"}
                  </span>
                </div>
                <h1 className="mt-3 text-2xl font-semibold">
                  {mode === "signin" ? "Sign in" : "Create an account"}
                </h1>
                <p className="mt-2 hidden text-sm text-muted-foreground sm:block">
                  Accounts stop spam and duplicate votes. Stories are shown under a random handle —
                  never your email or name.
                </p>

                <form onSubmit={submit} className="mt-4 space-y-3 sm:mt-6 sm:space-y-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters"
                    />
                    {mode === "signin" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resetPassword()}
                        className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        Forgot password?
                      </button>
                    ) : null}
                  </div>
                  <Button type="submit" disabled={busy} className="w-full glow-primary">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    {mode === "signin" ? "Sign in" : "Create account"}
                  </Button>
                </form>

                <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground sm:my-5">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>

                {hasBiometric ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={biometricUnlock}
                    className="mb-3 w-full"
                  >
                    <Fingerprint className="size-4" />
                    Use fingerprint or face
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={googleSignIn}
                  className="w-full"
                >
                  <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
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
                  Continue with Google
                </Button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Google creates an account or signs you in. You can connect email later in
                  Settings.
                </p>

                <button
                  type="button"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  className="mt-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {mode === "signin"
                    ? "New here? Create an account"
                    : "Already have an account? Sign in"}
                </button>

                <p className="mt-4 flex items-start gap-2 border-l-2 border-primary/40 py-1 pl-3 text-[11px] text-muted-foreground sm:text-xs md:mt-6 md:rounded-xl md:border-0 md:bg-secondary/60 md:p-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-verified" />
                  Use a personal email, not your work email. We never publish emails, and employers
                  cannot see who posted.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
