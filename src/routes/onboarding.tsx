import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  AtSign,
  Flame,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Music2,
  Pencil,
  ShieldCheck,
  Sparkles,
  X as XIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { requiresEmailVerification } from "@/lib/email-verification";
import { notify as toast } from "@/lib/notifications-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProfilePhotoPicker } from "@/components/site/profile-photo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkUsername,
  completeOnboarding,
  getOnboardingState,
  getUsernameSuggestions,
  updateMyUsername,
} from "@/lib/onboarding.functions";

export const Route = createFileRoute("/onboarding")({
  validateSearch: (search: Record<string, unknown>) => ({
    editUsername: search["editUsername"] === true || search["editUsername"] === "true",
  }),
  head: () => ({
    meta: [
      { title: "Claim your username | Candid" },
      {
        name: "description",
        content:
          "Pick the username you will post under on Candid. Check availability live and add optional social links.",
      },
      { property: "og:title", content: "Claim your username | Candid" },
      {
        property: "og:description",
        content: "One step: choose a unique Candid username and you're in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnboardingPage,
});

type Status = "idle" | "checking" | "available" | "taken" | "invalid";

const SOCIAL_FIELDS = [
  { key: "x", label: "X (Twitter)", icon: XIcon, placeholder: "@yourhandle" },
  { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "@yourhandle" },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, placeholder: "linkedin.com/in/you" },
  { key: "tiktok", label: "TikTok", icon: Music2, placeholder: "@yourhandle" },
  { key: "website", label: "Website", icon: Globe, placeholder: "https://" },
] as const;

type SocialKey = (typeof SOCIAL_FIELDS)[number]["key"];

function OnboardingPage() {
  const { editUsername } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const check = useServerFn(checkUsername);
  const getSuggestions = useServerFn(getUsernameSuggestions);
  const complete = useServerFn(completeOnboarding);
  const updateUsername = useServerFn(updateMyUsername);
  const state = useServerFn(getOnboardingState);

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [usernameAcknowledgementChecked, setUsernameAcknowledgementChecked] = useState(false);
  const [usernameAcknowledged, setUsernameAcknowledged] = useState(false);
  const [usernameChoice, setUsernameChoice] = useState<"own" | "generated" | null>(null);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [socials, setSocials] = useState<Record<SocialKey, string>>({
    x: "",
    instagram: "",
    linkedin: "",
    tiktok: "",
    website: "",
  });
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (loading) return;
    let active = true;
    if (!user) {
      navigate({ to: "/auth" });
      return () => {
        active = false;
      };
    }
    if (requiresEmailVerification(user)) {
      navigate({ to: "/verify-email" });
      return () => {
        active = false;
      };
    }
    void state({ data: undefined })
      .then((result) => {
        if (!active) return;
        setPhotoUrl(result.photoUrl);
        if (!result.needsOnboarding && !editUsername) navigate({ to: "/" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Could not load onboarding.");
      });
    return () => {
      active = false;
    };
  }, [loading, user, navigate, state, editUsername]);

  async function generateAliases() {
    setLoadingSuggestions(true);
    setSuggestionError(null);
    setUsername("");
    setMessage(null);
    try {
      const result = await getSuggestions({ data: { seed: "Candid" } });
      setUsernameSuggestions(result.suggestions);
      if (!result.suggestions.length) {
        setSuggestionError("We couldn’t find an available suggestion. Try again or choose your own.");
      }
    } catch {
      setUsernameSuggestions([]);
      setSuggestionError("Could not generate usernames right now. Please try again.");
    } finally {
      setLoadingSuggestions(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    const value = username.trim();
    if (!value) {
      setStatus("idle");
      setMessage(null);
      return;
    }
    setStatus("checking");
    const id = requestId.current + 1;
    requestId.current = id;
    const timer = setTimeout(async () => {
      try {
        const result = await check({ data: { username: value } });
        if (requestId.current !== id) return;
        setStatus(result.available ? "available" : result.reason ? "taken" : "invalid");
        setMessage(result.reason);
      } catch {
        if (requestId.current !== id) return;
        setStatus("invalid");
        setMessage("Could not check right now.");
      }
    }, 380);
    return () => clearTimeout(timer);
  }, [username, user, check]);

  async function saveAliasChange() {
    if (status !== "available" || saving) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const result = await updateUsername({ data: { username: username.trim().toLowerCase() } });
      if (!result.ok) {
        setStatus("taken");
        setMessage(result.reason ?? "That username is no longer available.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["onboarding-state", user?.uid] });
      toast.success("Your new alias is live.");
      await navigate({ to: "/profile" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not update your alias.";
      setSubmitError(reason);
      toast.error(reason);
    } finally {
      setSaving(false);
    }
  }

  async function submit(includeSocials = true) {
    if (status !== "available") return;
    setSaving(true);
    setSubmitError(null);
    try {
      if (!user) {
        navigate({ to: "/auth" });
        return;
      }
      // Refresh claims before the server checks the verified-email requirement.
      await user.getIdToken(true);
      const result = await complete({
        data: {
          username: username.trim().toLowerCase(),
          socials: {
            x: includeSocials ? socials.x.trim() || null : null,
            instagram: includeSocials ? socials.instagram.trim() || null : null,
            linkedin: includeSocials ? socials.linkedin.trim() || null : null,
            tiktok: includeSocials ? socials.tiktok.trim() || null : null,
            website: includeSocials ? socials.website.trim() || null : null,
          },
        },
      });
      if (!result.ok) {
        setStatus("taken");
        setMessage(result.reason ?? "That username just got taken.");
        setStep(0);
        return;
      }
      navigate({ to: "/" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not save your username";
      if (/verify your email|email verification required/i.test(reason)) {
        navigate({ to: "/verify-email" });
      } else {
        setSubmitError(reason);
        toast.error(reason);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-[75dvh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Getting your onboarding ready…
      </div>
    );
  }

  return (
    <main className="min-h-dvh w-full bg-muted/30 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-sm font-semibold">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Flame className="size-4" /></span>
            Candid
          </div>
          {editUsername ? (
            <button type="button" onClick={() => void navigate({ to: "/profile" })} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Cancel edit
            </button>
          ) : <span className="text-xs text-muted-foreground">Your account</span>}
        </header>
        <div>
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mb-7"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {editUsername ? "Update your public username" : `Account setup · ${step + 1} of 3`}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {step === 0
              ? !usernameAcknowledged
                ? "Your username is public"
                : !usernameChoice
                  ? "How would you like to choose it?"
                  : usernameChoice === "own"
                    ? "Choose your username"
                    : "Pick a suggested username"
              : step === 1
                ? "Add a profile photo"
                : "Add your links"}
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            {step === 0
              ? !usernameAcknowledged
                ? "The username you choose can identify you to other members when you post a story or comment. Your email and legal name are not displayed, but avoid using your real name or details that could identify you."
                : !usernameChoice
                  ? "You can choose a unique username yourself, or let Candid suggest available options. You can change your mind before continuing."
                  : usernameChoice === "own"
                    ? "Choose a name you’re comfortable having shown on your stories and comments. We’ll check that it’s available."
                    : "Choose one of these available names, or ask Candid for another set."
              : step === 1
                ? "A photo is optional and visible on your profile. Choose an image that doesn’t identify you, or continue without one."
                : "Social links are optional. Add any you want people to find on your profile."}
          </p>
        </motion.div>

        {!editUsername ? <div className="mb-5 flex gap-2" aria-label={`Profile setup step ${step + 1} of 3`}>
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={false}
                animate={{ width: step >= index ? "100%" : "0%" }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
            </div>
          ))}
        </div> : null}

        <AnimatePresence mode="wait" initial={false}>
          {step === 0 ? (
            <motion.section
              key="username"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
            >
              {!usernameAcknowledged ? (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-5 sm:p-6">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400"><ShieldCheck className="size-6" /></span>
                    <h2 className="mt-4 text-xl font-semibold tracking-tight">Your name, your choice</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Your username appears next to the stories and comments you share. Other members may recognize it, so choose a name you’re comfortable using publicly.</p>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">Your email and legal name are not shown. Still, avoid usernames or story details that could identify you if you want to stay private.</p>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:bg-secondary/40">
                    <input type="checkbox" checked={usernameAcknowledgementChecked} onChange={(event) => setUsernameAcknowledgementChecked(event.target.checked)} className="mt-1 size-4 accent-primary" />
                    <span className="text-sm leading-5">I understand that my username can be seen on my stories and comments.</span>
                  </label>
                  <Button className="w-full glow-primary" disabled={!usernameAcknowledgementChecked} onClick={() => setUsernameAcknowledged(true)}>Continue <ArrowRight className="size-4" /></Button>
                </div>
              ) : !usernameChoice ? (
                <div className="space-y-3">
                  <button type="button" onClick={() => { setUsernameChoice("own"); setUsernameSuggestions([]); setUsername(""); setMessage(null); }} className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-background p-4 text-left transition-all hover:border-primary/50 hover:bg-secondary/40 sm:p-5">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-foreground"><Pencil className="size-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block font-semibold">I’ll choose my own</span><span className="mt-1 block text-sm text-muted-foreground">Pick a unique username you want to post under.</span></span>
                    <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </button>
                  <button type="button" disabled={loadingSuggestions} onClick={() => { setUsernameChoice("generated"); void generateAliases(); }} className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-background p-4 text-left transition-all hover:border-primary/50 hover:bg-secondary/40 disabled:opacity-60 sm:p-5">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="size-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block font-semibold">Let Candid choose for me</span><span className="mt-1 block text-sm text-muted-foreground">We’ll suggest available names you can pick from.</span></span>
                    {loadingSuggestions ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />}
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <button type="button" onClick={() => { setUsernameChoice(null); setUsername(""); setUsernameSuggestions([]); setSuggestionError(null); setMessage(null); }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Choose another option</button>
                  {usernameChoice === "own" ? (
                    <div className="space-y-3">
                      <Label htmlFor="username">Your unique username</Label>
                      <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 focus-within:border-primary"><AtSign className="size-4 shrink-0 text-muted-foreground" /><Input id="username" autoFocus autoComplete="off" spellCheck={false} maxLength={20} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="yourname" className="border-0 bg-transparent px-0 focus-visible:ring-0" /></div>
                      <p className="text-xs leading-5 text-muted-foreground">Use 3–20 letters, numbers, dots, or underscores. Don’t use your real name if you want to stay anonymous.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Username ideas</p>
                      <p className="text-xs text-muted-foreground">We’ll check availability when you select one.</p>
                      {loadingSuggestions ? <div className="flex items-center gap-2 rounded-xl bg-secondary/50 p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Generating username ideas…</div> : usernameSuggestions.length ? <div className="grid gap-2 sm:grid-cols-2">{usernameSuggestions.map((suggestion) => <button key={suggestion} type="button" aria-pressed={username === suggestion} onClick={() => setUsername(suggestion)} className={cn("rounded-xl border px-4 py-3 text-left font-medium transition-colors", username === suggestion ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30" : "border-border bg-background hover:border-primary/50")}>@{suggestion}</button>)}</div> : null}
                      {suggestionError ? <p role="status" className="text-sm text-muted-foreground">{suggestionError}</p> : null}
                      <Button type="button" variant="outline" onClick={() => void generateAliases()} disabled={loadingSuggestions}><Sparkles className="size-4" /> Generate more</Button>
                    </div>
                  )}
                  {username ? <p aria-live="polite" className={`text-sm ${status === "available" ? "text-verified" : status === "taken" || status === "invalid" ? "text-destructive" : "text-muted-foreground"}`}>{status === "checking" ? "Checking username availability…" : status === "available" ? "This username is available." : status === "taken" || status === "invalid" ? message ?? "Choose another username." : "Checking username availability…"}</p> : null}
                  {submitError ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 p-3 text-sm text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" /><p className="min-w-0 break-words">{submitError}</p></div> : null}
                  {editUsername ? <Button className="w-full glow-primary" disabled={status !== "available" || saving} onClick={() => void saveAliasChange()}>{saving ? <Loader2 className="size-4 animate-spin" /> : null}{saving ? "Saving username…" : "Save username"}</Button> : <Button className="w-full glow-primary" disabled={status !== "available" || saving} onClick={() => setStep(1)}>Use @{username} <ArrowRight className="size-4" /></Button>}
                </div>
              )}
            </motion.section>
          ) : step === 1 ? (
            <motion.section
              key="photo"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
            >
              <ProfilePhotoPicker
                photoUrl={photoUrl}
                initials={(user?.email?.[0] ?? "C").toUpperCase()}
                onSaved={(nextPhotoUrl) => {
                  setPhotoUrl(nextPhotoUrl);
                  if (user) {
                    queryClient.setQueryData(["onboarding-state", user.uid], (previous: unknown) =>
                      previous && typeof previous === "object"
                        ? { ...previous, photoUrl: nextPhotoUrl }
                        : previous,
                    );
                  }
                }}
              />
              <div className="flex items-center gap-3">
                <Button className="flex-1 glow-primary" onClick={() => setStep(2)}>
                  {photoUrl ? "Continue with photo" : "Continue without photo"}{" "}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Back to username
              </button>
            </motion.section>
          ) : (
            <motion.section
              key="socials"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
            >
              <div className="space-y-3">
                {SOCIAL_FIELDS.map((field, index) => (
                  <motion.div
                    key={field.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * index }}
                    className="flex items-center gap-2 rounded-xl border border-input px-3 focus-within:border-primary"
                  >
                    <field.icon className="size-4 shrink-0 text-muted-foreground" />
                    <Input
                      value={socials[field.key]}
                      onChange={(event) =>
                        setSocials((prev) => ({ ...prev, [field.key]: event.target.value }))
                      }
                      placeholder={`${field.label} — ${field.placeholder}`}
                      className="border-0 bg-transparent px-0 focus-visible:ring-0"
                    />
                  </motion.div>
                ))}
              </div>

              {submitError ? (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 p-3 text-sm text-danger"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p className="min-w-0 break-words">{submitError}</p>
                </div>
              ) : null}

              <Button className="mt-6 w-full glow-primary" disabled={saving} onClick={() => void submit()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? "Finishing setup…" : `Enter Candid as @${username}`}
              </Button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit(false)}
                className="mt-3 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
              >
                Skip links and finish
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Back
              </button>
            </motion.section>
          )}
        </AnimatePresence>
        </div>
        <footer className="mt-6 pb-2 text-center text-xs leading-5 text-muted-foreground">Your alias appears publicly. Candid cannot guarantee complete anonymity.</footer>
      </div>
    </main>
  );
}

