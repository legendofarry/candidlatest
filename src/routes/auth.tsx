import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { notify as toast } from "@/lib/notifications-store";
import { EyeOff, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import {
  authenticateWithBiometric,
  getCredentials,
  markUnlocked,
} from "@/lib/biometrics";
import { firebaseAuth } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { getOnboardingState } from "@/lib/onboarding.functions";


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

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const fetchOnboardingState = useServerFn(getOnboardingState);

  /** Send people who have not claimed a username to onboarding first. */
  async function continueAfterAuth() {
    try {
      const state = await fetchOnboardingState();
      navigate({ to: state.needsOnboarding ? "/onboarding" : "/" });
    } catch {
      navigate({ to: "/onboarding" });
    }
  }

  useEffect(() => {
    setHasBiometric(getCredentials().length > 0);
  }, []);

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
      await continueAfterAuth();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(firebaseAuth, provider);
      const isNewUser = getAdditionalUserInfo(result)?.isNewUser ?? false;

      if (isNewUser) {
        // Google is sign-in only: brand new people must register with email first.
        try {
          await deleteUser(result.user);
        } catch {
          await signOut(firebaseAuth);
        }
        toast.error("No Candid account found. Create one with your email first, then use Google.");
        setMode("signup");
        return;
      }

      toast.success("Signed in. You are anonymous to everyone else.");
      await continueAfterAuth();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google sign-in failed";
      if (!message.includes("popup-closed-by-user") && !message.includes("cancelled-popup")) {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }



  return (
    <div className="mx-auto max-w-md animate-rise">
      <div className="glass-card rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 text-primary">
          <EyeOff className="size-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Anonymous by design
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold">
          {mode === "signin" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Accounts stop spam and duplicate votes. Stories are shown under a random handle — never
          your email or name.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2">
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
          <div className="space-y-2">
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
          </div>
          <Button type="submit" disabled={busy} className="w-full glow-primary">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
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
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Google works only for existing accounts. New here? Sign up with email first.
        </p>



        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>

        <p className="mt-6 flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-verified" />
          Use a personal email, not your work email. We never publish emails, and employers cannot
          see who posted.
        </p>
      </div>
    </div>
  );
}
