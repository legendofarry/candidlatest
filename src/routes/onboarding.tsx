import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  AtSign,
  Check,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Music2,
  Sparkles,
  X as XIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { notify as toast } from "@/lib/notifications-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkUsername,
  completeOnboarding,
  getOnboardingState,
  getUsernameSuggestions,
} from "@/lib/onboarding.functions";

export const Route = createFileRoute("/onboarding")({
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
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const check = useServerFn(checkUsername);
  const suggest = useServerFn(getUsernameSuggestions);
  const complete = useServerFn(completeOnboarding);
  const state = useServerFn(getOnboardingState);

  const [step, setStep] = useState<0 | 1>(0);
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [socials, setSocials] = useState<Record<SocialKey, string>>({
    x: "",
    instagram: "",
    linkedin: "",
    tiktok: "",
    website: "",
  });
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    void state({ data: undefined }).then((result) => {
      if (!result.needsOnboarding) navigate({ to: "/" });
    });
  }, [loading, user, navigate, state]);

  const seed = useMemo(() => {
    const raw = user?.email?.split("@")[0] ?? "candid";
    return raw.toLowerCase().replace(/[^a-z0-9._]/g, "");
  }, [user?.email]);

  const loadSuggestions = useCallback(
    async (value: string) => {
      const result = await suggest({ data: { seed: value || seed } });
      setSuggestions(result.suggestions);
    },
    [seed, suggest],
  );

  useEffect(() => {
    if (!user) return;
    void loadSuggestions(seed);
  }, [user, seed, loadSuggestions]);

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
        if (!result.available) void loadSuggestions(value);
      } catch {
        if (requestId.current !== id) return;
        setStatus("invalid");
        setMessage("Could not check right now.");
      }
    }, 380);
    return () => clearTimeout(timer);
  }, [username, user, check, loadSuggestions]);

  async function submit() {
    if (status !== "available") return;
    setSaving(true);
    try {
      const result = await complete({
        data: {
          username: username.trim().toLowerCase(),
          socials: {
            x: socials.x.trim() || null,
            instagram: socials.instagram.trim() || null,
            linkedin: socials.linkedin.trim() || null,
            tiktok: socials.tiktok.trim() || null,
            website: socials.website.trim() || null,
          },
        },
      });
      if (!result.ok) {
        setStatus("taken");
        setMessage(result.reason ?? "That username just got taken.");
        setStep(0);
        return;
      }
      toast.success(`Welcome, @${username.trim().toLowerCase()}`);
      navigate({ to: "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your username");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative -mx-4 -my-6 min-h-[100dvh] overflow-hidden px-4 py-10 sm:px-6">
      <AuroraBackdrop />

      <div className="relative mx-auto flex w-full max-w-md flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6 text-center"
        >
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 220, damping: 16 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary"
          >
            <Sparkles className="size-3.5" />
            Step {step + 1} of 2
          </motion.span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {step === 0 ? "Pick your username" : "Add your links"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === 0
              ? "This is the name every post, comment and reply of yours will carry."
              : "Optional. These only show on your profile — skip if you'd rather not."}
          </p>
        </motion.div>

        <div className="mb-6 flex gap-2">
          {[0, 1].map((index) => (
            <div key={index} className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={false}
                animate={{ width: step >= index ? "100%" : "0%" }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === 0 ? (
            <motion.section
              key="username"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="glass-card rounded-2xl border border-border p-5"
            >
              <Label htmlFor="username" className="text-xs uppercase tracking-wider">
                Username
              </Label>
              <div
                className={`mt-2 flex items-center gap-2 rounded-xl border px-3 transition-colors ${
                  status === "available"
                    ? "border-verified/70 shadow-[0_0_0_3px_hsl(var(--verified)/0.12)]"
                    : status === "taken" || status === "invalid"
                      ? "border-destructive/70"
                      : "border-input"
                }`}
              >
                <AtSign className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  id="username"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  value={username}
                  onChange={(event) =>
                    setUsername(event.target.value.toLowerCase().replace(/\s+/g, "_"))
                  }
                  placeholder="e.g. quiet_analyst"
                  className="border-0 bg-transparent px-0 focus-visible:ring-0"
                />
                <AnimatePresence mode="wait">
                  {status === "checking" ? (
                    <motion.span key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </motion.span>
                  ) : status === "available" ? (
                    <motion.span
                      key="a"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 14 }}
                    >
                      <Check className="size-4 text-verified" />
                    </motion.span>
                  ) : status === "taken" || status === "invalid" ? (
                    <motion.span key="t" initial={{ x: -4 }} animate={{ x: [0, -4, 4, 0] }}>
                      <XIcon className="size-4 text-destructive" />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>

              <AnimatePresence initial={false}>
                {message || status === "available" ? (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`mt-2 text-xs ${
                      status === "available" ? "text-verified" : "text-destructive"
                    }`}
                  >
                    {status === "available" ? `@${username} is available` : message}
                  </motion.p>
                ) : null}
              </AnimatePresence>

              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Available suggestions
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <AnimatePresence initial={false}>
                    {suggestions.map((item, index) => (
                      <motion.button
                        key={item}
                        type="button"
                        layout
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ delay: index * 0.04 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => setUsername(item)}
                        className="rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        @{item}
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <Button
                className="mt-6 w-full glow-primary"
                disabled={status !== "available"}
                onClick={() => setStep(1)}
              >
                Continue
                <ArrowRight className="size-4" />
              </Button>
            </motion.section>
          ) : (
            <motion.section
              key="socials"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="glass-card rounded-2xl border border-border p-5"
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

              <Button className="mt-6 w-full glow-primary" disabled={saving} onClick={submit}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Enter Candid as @{username}
              </Button>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Back to username
              </button>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AuroraBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-24 top-0 size-72 rounded-full bg-primary/25 blur-3xl"
        animate={{ x: [0, 40, -10, 0], y: [0, 30, 60, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-20 top-40 size-80 rounded-full bg-verified/20 blur-3xl"
        animate={{ x: [0, -30, 20, 0], y: [0, 40, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
