import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  AtSign,
  BriefcaseBusiness,
  Check,
  Clock3,
  Coins,
  Flame,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Megaphone,
  Music2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X as XIcon,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useAuth } from "@/hooks/useAuth";
import { requiresEmailVerification } from "@/lib/email-verification";
import { notify as toast } from "@/lib/notifications-store";
import { Button } from "@/components/ui/button";
import { ProfilePhotoPicker } from "@/components/site/profile-photo";
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

type LensAnswer = {
  scenario1?: "contract" | "accept";
  scenario2?: "breakdown" | "wait";
  scenario3?: "pushback" | "doit";
  scenario4?: "clarity" | "continue";
  scenario5?: "ask" | "findout";
};

type LensInterests = {
  payBenefits: number;
  contracts: number;
  management: number;
  culture: number;
  career: number;
};

type CandidLensData = {
  completed: boolean;
  skipped: boolean;
  answers: LensAnswer;
  interests: LensInterests;
};

type LensScreen = "intro" | "scenario" | "transition" | "result" | "onboarding";

type LensDraft = {
  screen: LensScreen;
  scenarioIndex: number;
  answers: LensAnswer;
  skipped: boolean;
};

const LENS_SCENARIOS = [
  {
    label: "THE OFFER",
    icon: BriefcaseBusiness,
    text: "You just got the job. HR says: ‘We’ll sort out the contract once you start.’",
    choices: [
      { value: "accept", label: "Accept — finally, a job" },
      { value: "contract", label: "Ask for the contract first" },
    ],
  },
  {
    label: "PAYDAY",
    icon: Coins,
    text: "Your first payday arrives. Your payslip says KSh 45,000. Your M-Pesa receives KSh 32,000.",
    choices: [
      { value: "breakdown", label: "Ask HR for the breakdown" },
      { value: "wait", label: "Wait and see what happens" },
    ],
  },
  {
    label: "THE MANAGER",
    icon: Clock3,
    text: "It’s Friday, 5:47 PM. Your manager says: ‘Need this before Monday morning.’",
    choices: [
      { value: "pushback", label: "Push back" },
      { value: "doit", label: "Do it and move on" },
    ],
  },
  {
    label: "THE JOB AD",
    icon: Megaphone,
    text: "The advert says KSh 40k–60k. In the interview: ‘We’ll discuss salary after probation.’",
    choices: [
      { value: "clarity", label: "Ask for clarity" },
      { value: "continue", label: "Keep the interview going" },
    ],
  },
  {
    label: "THE CULTURE",
    icon: UsersRound,
    text: "Someone quietly tells you: ‘People don’t usually stay here very long.’",
    choices: [
      { value: "ask", label: "Ask why" },
      { value: "findout", label: "Take the job and find out" },
    ],
  },
] as const;

const LENS_INTEREST_LABELS: { key: keyof LensInterests; label: string }[] = [
  { key: "payBenefits", label: "Pay & benefits" },
  { key: "contracts", label: "Contracts & policies" },
  { key: "management", label: "Management" },
  { key: "culture", label: "Workplace culture" },
  { key: "career", label: "Career decisions" },
];

function getLensInterests(answers: LensAnswer): LensInterests {
  const interests: LensInterests = {
    payBenefits: 0,
    contracts: 0,
    management: 0,
    culture: 0,
    career: 0,
  };
  if (answers.scenario1 === "contract") interests.contracts += 2;
  if (answers.scenario1 === "accept") interests.career += 1;
  if (answers.scenario2 === "breakdown") interests.payBenefits += 2;
  if (answers.scenario3 === "pushback") interests.management += 2;
  if (answers.scenario3 === "doit") interests.management += 1;
  if (answers.scenario4 === "clarity") {
    interests.payBenefits += 1;
    interests.contracts += 1;
  }
  if (answers.scenario4 === "continue") interests.career += 1;
  if (answers.scenario5 === "ask") interests.culture += 2;
  if (answers.scenario5 === "findout") {
    interests.culture += 1;
    interests.career += 1;
  }
  return interests;
}

function emptyLensData(skipped: boolean): CandidLensData {
  return {
    completed: false,
    skipped,
    answers: {},
    interests: { payBenefits: 0, contracts: 0, management: 0, culture: 0, career: 0 },
  };
}

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const check = useServerFn(checkUsername);
  const suggest = useServerFn(getUsernameSuggestions);
  const complete = useServerFn(completeOnboarding);
  const state = useServerFn(getOnboardingState);

  const [lensScreen, setLensScreen] = useState<LensScreen>("intro");
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [lensAnswers, setLensAnswers] = useState<LensAnswer>({});
  const [lensSkipped, setLensSkipped] = useState(false);
  const [lensHydrated, setLensHydrated] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
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
    const storageKey = `candid-onboarding-lens:${user.uid}`;
    void state({ data: undefined })
      .then((result) => {
        if (!active) return;
        setPhotoUrl(result.photoUrl);
        if (!result.needsOnboarding) {
          navigate({ to: "/" });
          return;
        }
        try {
          const rawDraft = window.localStorage.getItem(storageKey);
          if (rawDraft) {
            const draft = JSON.parse(rawDraft) as Partial<LensDraft>;
            const validScreen = [
              "intro",
              "scenario",
              "transition",
              "result",
              "onboarding",
            ].includes(String(draft.screen));
            if (validScreen) {
              setLensScreen(draft.screen as LensScreen);
              setScenarioIndex(Math.max(0, Math.min(4, Number(draft.scenarioIndex) || 0)));
              setLensAnswers(
                draft.answers && typeof draft.answers === "object" ? draft.answers : {},
              );
              setLensSkipped(Boolean(draft.skipped));
            }
          }
        } catch {
          window.localStorage.removeItem(storageKey);
        }
        setLensHydrated(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Could not load onboarding.");
        setLensHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [loading, user, navigate, state]);

  useEffect(() => {
    if (!user || !lensHydrated) return;
    const draft: LensDraft = {
      screen: lensScreen,
      scenarioIndex,
      answers: lensAnswers,
      skipped: lensSkipped,
    };
    try {
      window.localStorage.setItem(`candid-onboarding-lens:${user.uid}`, JSON.stringify(draft));
    } catch {
      // The in-memory experience still works if browser storage is unavailable.
    }
  }, [user, lensHydrated, lensScreen, scenarioIndex, lensAnswers, lensSkipped]);

  useEffect(() => {
    if (lensScreen !== "transition") return;
    const timer = window.setTimeout(
      () => {
        setSelectedChoice(null);
        if (scenarioIndex >= LENS_SCENARIOS.length - 1) setLensScreen("result");
        else {
          setScenarioIndex((current) => current + 1);
          setLensScreen("scenario");
        }
      },
      prefersReducedMotion ? 0 : 420,
    );
    return () => window.clearTimeout(timer);
  }, [lensScreen, scenarioIndex, prefersReducedMotion]);

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
          candidLens: lensSkipped
            ? emptyLensData(true)
            : {
                completed: true,
                skipped: false,
                answers: lensAnswers,
                interests: getLensInterests(lensAnswers),
              },
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
      if (user) {
        try {
          window.localStorage.removeItem(`candid-onboarding-lens:${user.uid}`);
        } catch {
          // A stored draft is harmless if browser storage cannot be cleared.
        }
      }
      toast.success(`Welcome, @${username.trim().toLowerCase()}`);
      navigate({ to: "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your username");
    } finally {
      setSaving(false);
    }
  }

  function answerScenario(value: string) {
    if (selectedChoice) return;
    setSelectedChoice(value);
    const key = `scenario${scenarioIndex + 1}` as keyof LensAnswer;
    setLensAnswers((current) => ({ ...current, [key]: value }));
    setLensScreen("transition");
  }

  function skipLens() {
    setLensAnswers({});
    setLensSkipped(true);
    setLensScreen("onboarding");
  }

  if (loading || !user || !lensHydrated) {
    return (
      <div className="flex min-h-[75dvh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Getting your onboarding ready…
      </div>
    );
  }

  if (lensScreen !== "onboarding") {
    return (
      <CandidLensExperience
        screen={lensScreen}
        scenarioIndex={scenarioIndex}
        selectedChoice={selectedChoice}
        answers={lensAnswers}
        onStart={() => setLensScreen("scenario")}
        onAnswer={answerScenario}
        onSkip={skipLens}
        onContinue={() => setLensScreen("onboarding")}
        reducedMotion={Boolean(prefersReducedMotion)}
      />
    );
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
            Step {step + 1} of 3
          </motion.span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {step === 0 ? "Pick your username" : step === 1 ? "Add a photo" : "Add your links"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === 0
              ? "This is the name every post, comment and reply of yours will carry."
              : step === 1
                ? "Optional. Add a photo to your profile, or continue without one."
                : "Optional. These only show on your profile — skip if you'd rather not."}
          </p>
        </motion.div>

        <div className="mb-6 flex gap-2">
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
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === 0 ? (
            <motion.section
              key="username"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-none border-0 bg-transparent p-0 md:glass-card md:rounded-2xl md:border md:border-border md:p-5"
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
                    <motion.span
                      key="c"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
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
          ) : step === 1 ? (
            <motion.section
              key="photo"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5 rounded-none border-0 bg-transparent p-0 md:glass-card md:rounded-2xl md:border md:border-border md:p-5"
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
              className="rounded-none border-0 bg-transparent p-0 md:glass-card md:rounded-2xl md:border md:border-border md:p-5"
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
                onClick={() => setStep(1)}
                className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Back
              </button>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

type CandidLensExperienceProps = {
  screen: Exclude<LensScreen, "onboarding">;
  scenarioIndex: number;
  selectedChoice: string | null;
  answers: LensAnswer;
  onStart: () => void;
  onAnswer: (value: string) => void;
  onSkip: () => void;
  onContinue: () => void;
  reducedMotion: boolean;
};

function CandidLensExperience({
  screen,
  scenarioIndex,
  selectedChoice,
  answers,
  onStart,
  onAnswer,
  onSkip,
  onContinue,
  reducedMotion,
}: CandidLensExperienceProps) {
  const scenario = LENS_SCENARIOS[scenarioIndex];
  const scenarioKey = `scenario${scenarioIndex + 1}` as keyof LensAnswer;
  const interests = getLensInterests(answers);
  const highlightedInterests = LENS_INTEREST_LABELS.filter((item) => interests[item.key] > 0)
    .sort((first, second) => interests[second.key] - interests[first.key])
    .slice(0, 3);
  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.36, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <main className="relative -mx-4 -my-6 flex min-h-[100dvh] w-auto items-center justify-center overflow-hidden px-5 py-8 sm:px-8">
      <AuroraBackdrop reducedMotion={reducedMotion} />
      <div className="relative mx-auto flex w-full max-w-xl flex-col">
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3 font-display text-lg font-semibold tracking-tight">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
              <Flame className="size-5" />
            </span>
            Candid
          </div>
          {screen !== "intro" ? (
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Your Candid Lens
            </span>
          ) : null}
        </header>

        <AnimatePresence mode="wait" initial={false}>
          {screen === "intro" ? (
            <motion.section
              key="lens-intro"
              initial={reducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition}
              {...(reducedMotion ? {} : { exit: { opacity: 0, y: -10 } })}
              className="w-full"
            >
              <div className="mb-7 flex size-14 items-center justify-center rounded-[1.25rem] border border-primary/20 bg-primary/10 text-primary">
                <Sparkles className="size-6" />
              </div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                A quick gut check
              </p>
              <h1 className="max-w-lg font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
                Before you start<span className="text-primary">…</span>
              </h1>
              <p className="mt-4 text-lg text-foreground">5 situations. Trust your gut.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                No right answers. Just your instincts.
              </p>
              <Button
                onClick={onStart}
                className="mt-9 h-12 w-full rounded-xl text-base sm:w-auto sm:min-w-52"
              >
                Let’s go <ArrowRight className="size-4" />
              </Button>
              <button
                type="button"
                onClick={onSkip}
                className="mt-5 block min-h-11 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:w-auto sm:text-left"
              >
                Skip for now
              </button>
            </motion.section>
          ) : screen === "scenario" && scenario ? (
            <motion.section
              key={`lens-scenario-${scenarioIndex}`}
              initial={reducedMotion ? false : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={transition}
              {...(reducedMotion ? {} : { exit: { opacity: 0, x: -18 } })}
              aria-live="polite"
              className="w-full"
            >
              <div className="mb-5 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>{String(scenarioIndex + 1).padStart(2, "0")} / 05</span>
                <span>Trust your gut</span>
              </div>
              <div className="mb-7 h-1 overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={false}
                  animate={{ width: `${((scenarioIndex + 1) / LENS_SCENARIOS.length) * 100}%` }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
                />
              </div>

              <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-border bg-card/70 text-primary">
                <scenario.icon className="size-5" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {scenario.label}
              </p>
              <h1 className="mt-3 font-display text-[1.65rem] font-semibold leading-snug tracking-tight sm:text-3xl">
                {scenario.text}
              </h1>

              <div className="mt-8 grid gap-3">
                {scenario.choices.map((choice, index) => {
                  const selected = selectedChoice === choice.value;
                  return (
                    <motion.button
                      key={choice.value}
                      type="button"
                      disabled={Boolean(selectedChoice)}
                      aria-pressed={answers[scenarioKey] === choice.value}
                      onClick={() => onAnswer(choice.value)}
                      animate={selected ? { scale: 1.015 } : { scale: 1 }}
                      transition={reducedMotion ? { duration: 0 } : { duration: 0.18 }}
                      {...(reducedMotion ? {} : { whileTap: { scale: 0.985 } })}
                      className={`flex min-h-[4.5rem] w-full items-center justify-between gap-4 rounded-2xl border px-5 py-4 text-left text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:cursor-default ${
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card/65 text-foreground hover:border-primary/55 hover:bg-card"
                      }`}
                    >
                      <span>{choice.label}</span>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">
                        {index === 0 ? "A" : "B"}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={Boolean(selectedChoice)}
                onClick={onSkip}
                className="mt-6 min-h-11 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
              >
                Skip for now
              </button>
            </motion.section>
          ) : screen === "transition" ? (
            <motion.section
              key="lens-transition"
              initial={reducedMotion ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={transition}
              {...(reducedMotion ? {} : { exit: { opacity: 0, scale: 1.02 } })}
              aria-live="polite"
              className="flex min-h-72 flex-col items-center justify-center text-center"
            >
              <span className="mb-5 flex size-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                <Check className="size-6" />
              </span>
              <h1 className="font-display text-3xl font-semibold tracking-tight">Got it.</h1>
              <p className="mt-2 text-sm text-muted-foreground">No wrong answers here.</p>
            </motion.section>
          ) : screen === "result" ? (
            <motion.section
              key="lens-result"
              initial={reducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition}
              className="w-full"
            >
              <div className="mb-7 flex size-14 items-center justify-center rounded-[1.25rem] border border-primary/20 bg-primary/10 text-primary">
                <ShieldCheck className="size-6" />
              </div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Your Candid Lens
              </p>
              <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
                Okay, we get you.
              </h1>
              <p className="mt-4 text-base text-muted-foreground">
                Your Candid Lens is taking shape.
              </p>
              <div className="mt-8">
                <p className="text-sm font-medium text-foreground">Your choices leaned toward:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {highlightedInterests.map((item) => (
                    <span
                      key={item.key}
                      className="rounded-full border border-primary/20 bg-primary/10 px-3.5 py-2 text-sm font-medium text-foreground"
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-8 text-sm font-medium text-foreground">That’s useful.</p>
              <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                Your answers aren’t a score or a personality test. They help Candid bring the
                details behind job adverts into view.
              </p>
              <Button
                onClick={onContinue}
                className="mt-8 h-12 w-full rounded-xl text-base sm:w-auto sm:min-w-52"
              >
                Continue <ArrowRight className="size-4" />
              </Button>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>
    </main>
  );
}

function AuroraBackdrop({ reducedMotion = false }: { reducedMotion?: boolean } = {}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-24 top-0 size-72 rounded-full bg-primary/25 blur-3xl"
        animate={reducedMotion ? { x: 0, y: 0 } : { x: [0, 40, -10, 0], y: [0, 30, 60, 0] }}
        transition={
          reducedMotion ? { duration: 0 } : { duration: 18, repeat: Infinity, ease: "easeInOut" }
        }
      />
      <motion.div
        className="absolute -right-20 top-40 size-80 rounded-full bg-verified/20 blur-3xl"
        animate={reducedMotion ? { x: 0, y: 0 } : { x: [0, -30, 20, 0], y: [0, 40, -20, 0] }}
        transition={
          reducedMotion ? { duration: 0 } : { duration: 22, repeat: Infinity, ease: "easeInOut" }
        }
      />
    </div>
  );
}
