import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  AlertCircle,
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

const ALIAS_QUESTIONS = [
  { prompt: "Your pace", options: ["Steady", "Bold"] },
  { prompt: "Your hours", options: ["Dawn", "Night"] },
  { prompt: "Your energy", options: ["Cozy", "Wild"] },
  { prompt: "Your instinct", options: ["Sage", "Scout"] },
] as const;
const ALIAS_ENDINGS = ["Runner", "Rebel", "Nomad", "Comet", "ChomaBandit"];
type AliasStage = "seed" | "questions" | "result";

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
  const [usernameSeed, setUsernameSeed] = useState("");
  const [username, setUsername] = useState("");
  const [aliasStage, setAliasStage] = useState<AliasStage>("seed");
  const [aliasAnswers, setAliasAnswers] = useState<(number | null)[]>([null, null, null, null]);
  const [aliasIdea, setAliasIdea] = useState("");
  const [aliasRound, setAliasRound] = useState(0);
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

  function generateAlias() {
    const base = usernameSeed.trim().replace(/[^a-z0-9]/gi, "").slice(0, 7);
    if (base.length < 3) {
      setAliasStage("seed");
      return;
    }
    if (aliasAnswers.some((answer) => answer === null)) return;
    const pace = ALIAS_QUESTIONS[0].options[aliasAnswers[0]!]!.toLowerCase();
    const time = ALIAS_QUESTIONS[1].options[aliasAnswers[1]!]!.toLowerCase();
    const energy = ALIAS_QUESTIONS[2].options[aliasAnswers[2]!]!.toLowerCase();
    const instinct = ALIAS_QUESTIONS[3].options[aliasAnswers[3]!]!.toLowerCase();
    const ending = ALIAS_ENDINGS[aliasRound % ALIAS_ENDINGS.length]!.toLowerCase();
    const options = [
      `${time}${base}${instinct}`,
      `${pace}${base}${energy}`,
      `${energy}${base}${ending}`,
      `${base}${instinct}${ending}`,
      `${pace}${base}${time}`,
    ];
    const candidate = options[aliasRound % options.length]!.slice(0, 20);
    setAliasIdea(candidate);
    setUsername(candidate);
    setAliasStage("result");
    setAliasRound((round) => round + 1);
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

  async function submit() {
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
      const lensComplete = Object.values(lensAnswers).filter(Boolean).length === 5;
      const result = await complete({
        data: {
          username: username.trim().toLowerCase(),
          candidLens: lensSkipped || !lensComplete
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
            {step === 0 ? aliasStage === "seed" ? "Start with a username" : aliasStage === "questions" ? "Make it yours" : "Your Candid alias" : step === 1 ? "Add a photo" : "Add your links"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === 0
                ? aliasStage === "seed"
                  ? "Choose a starting name. Your answers will shape it into the public alias used across Candid. Avoid using your real name."
                  : aliasStage === "questions"
                    ? "Answer a few quick questions. Candid will combine your choices with your starting name."
                    : "This generated alias is the name people will see on your posts and comments."
              : step === 1
                ? "Optional. Your profile photo is public; skip it if you prefer to stay less identifiable."
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
              {aliasStage === "seed" ? (
                <div className="space-y-4">
                  <Label htmlFor="username-seed">Starting username</Label>
                  <div className="flex items-center gap-2 rounded-xl border border-input px-3">
                    <AtSign className="size-4 shrink-0 text-muted-foreground" />
                    <Input
                      id="username-seed"
                      autoFocus
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={30}
                      value={usernameSeed}
                      onChange={(event) => setUsernameSeed(event.target.value)}
                      placeholder="Choose a name to build from"
                      className="border-0 bg-transparent px-0 focus-visible:ring-0"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">This is a starting point, not your final username. Candid will combine it with your answers. Don’t use your real name.</p>
                  <Button className="w-full glow-primary" disabled={usernameSeed.trim().replace(/[^a-z0-9]/gi, "").length < 3} onClick={() => setAliasStage("questions")}>
                    Next: answer a few questions <ArrowRight className="size-4" />
                  </Button>
                </div>
              ) : aliasStage === "questions" ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Starting with</span>
                    <span className="font-semibold">@{usernameSeed.trim().replace(/[^a-z0-9]/gi, "").slice(0, 7).toLowerCase()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {ALIAS_QUESTIONS.map((question, questionIndex) => (
                      <fieldset key={question.prompt} className="min-w-0">
                        <legend className="mb-1.5 text-xs text-muted-foreground">{question.prompt}</legend>
                        <div className="grid grid-cols-2 gap-1.5">
                          {question.options.map((option, optionIndex) => {
                            const selected = aliasAnswers[questionIndex] === optionIndex;
                            return (
                              <button
                                key={option}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setAliasAnswers((answers) => answers.map((answer, index) => index === questionIndex ? optionIndex : answer))}
                                className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${selected ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/50"}`}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setAliasStage("seed")}>Back</Button>
                    <Button className="flex-1 glow-primary" disabled={aliasAnswers.some((answer) => answer === null)} onClick={generateAlias}><Sparkles className="size-4" /> Create my alias</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5 text-center">
                  <motion.div
                    key={aliasIdea}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="rounded-2xl border border-primary/25 bg-primary/5 px-4 py-7"
                  >
                    <Sparkles className="mx-auto size-5 text-primary" />
                    <p className="mt-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Your Candid alias</p>
                    <p className="mt-2 break-all font-display text-2xl font-semibold">@{aliasIdea}</p>
                    <p className={`mt-2 text-sm ${status === "available" ? "text-verified" : status === "taken" || status === "invalid" ? "text-destructive" : "text-muted-foreground"}`}>
                      {status === "checking" ? "Checking availability…" : status === "available" ? "Available to claim" : status === "taken" || status === "invalid" ? message ?? "Try another alias" : "Checking availability…"}
                    </p>
                  </motion.div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="outline" className="flex-1" onClick={generateAlias}>Try another</Button>
                    <Button type="button" variant="ghost" className="flex-1" onClick={() => { setAliasStage("seed"); setUsername(""); setAliasIdea(""); }}>Change starting name</Button>
                  </div>
                  <Button className="w-full glow-primary" disabled={status !== "available"} onClick={() => setStep(1)}>
                    Claim this alias <ArrowRight className="size-4" />
                  </Button>
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

              {submitError ? (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 p-3 text-sm text-danger"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p className="min-w-0 break-words">{submitError}</p>
                </div>
              ) : null}

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
    .sort((first, second) => interests[second.key] - interests[first.key]);
  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.36, ease: [0.22, 1, 0.36, 1] as const };
  const answersMade = Object.keys(answers).length;
  const isQuestion = screen === "scenario" && Boolean(scenario);

  return (
    <main className="min-h-[100dvh] w-full bg-background px-4 py-4 text-foreground sm:px-8 sm:py-7 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col sm:min-h-[calc(100dvh-3.5rem)]">
        <header className="flex items-center justify-between border-b border-border/70 pb-4 sm:pb-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Flame className="size-5" /></span>
            <span className="font-display text-base font-bold tracking-tight">Candid</span>
            <span className="hidden h-5 w-px bg-border sm:block" />
            <span className="hidden text-sm text-muted-foreground sm:block">Your Lens</span>
          </div>
          <div className="flex items-center gap-3">
            {isQuestion ? <span className="text-xs font-medium tabular-nums text-muted-foreground">{scenarioIndex + 1} <span className="text-muted-foreground/50">/ 5</span></span> : null}
            {screen === "intro" || screen === "scenario" ? <button type="button" onClick={onSkip} className="min-h-10 rounded-full px-3 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground">Skip</button> : null}
          </div>
        </header>

        {isQuestion ? <div className="mt-5 flex gap-1.5 sm:mt-7" aria-label={`Question ${scenarioIndex + 1} of 5`}>
          {LENS_SCENARIOS.map((item, index) => <span key={item.label} className={`h-1 flex-1 rounded-full transition-colors ${index <= scenarioIndex ? "bg-primary" : "bg-secondary"}`} />)}
        </div> : null}

        <div className="grid flex-1 items-center gap-8 py-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)] lg:gap-16 lg:py-10">
          <AnimatePresence mode="wait" initial={false}>
            {screen === "intro" ? (
              <motion.section key="lens-intro" initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} {...(reducedMotion ? {} : { exit: { opacity: 0, y: -8 } })} transition={transition} className="w-full max-w-2xl">
                <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Sparkles className="size-4" /> A quick check-in</p>
                <h1 className="max-w-2xl font-display text-4xl font-semibold leading-[1.06] tracking-[-0.04em] sm:text-6xl">What do you look for at work?</h1>
                <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {LENS_SCENARIOS.map((item, index) => <div key={item.label} className="flex min-h-20 flex-col justify-between rounded-xl border border-border/70 bg-card/50 p-3"><span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">0{index + 1}</span><span className="text-xs font-medium">{item.label.toLowerCase()}</span></div>)}
                </div>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button onClick={onStart} className="h-12 w-full rounded-xl px-6 text-sm sm:w-auto">Start the check-in <ArrowRight className="size-4" /></Button>
                </div>
              </motion.section>
            ) : screen === "scenario" && scenario ? (
              <motion.section key={`lens-scenario-${scenarioIndex}`} initial={reducedMotion ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} {...(reducedMotion ? {} : { exit: { opacity: 0, x: -12 } })} transition={transition} aria-live="polite" className="w-full max-w-2xl">
                <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><scenario.icon className="size-4" /> {scenario.label}</p>
                <h1 className="font-display text-[1.75rem] font-semibold leading-[1.18] tracking-[-0.03em] sm:text-4xl">{scenario.text}</h1>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {scenario.choices.map((choice, index) => {
                    const selected = selectedChoice === choice.value;
                    return <motion.button key={choice.value} type="button" disabled={Boolean(selectedChoice)} aria-pressed={answers[scenarioKey] === choice.value} onClick={() => onAnswer(choice.value)} {...(reducedMotion ? {} : { whileTap: { scale: 0.985 } })} className={`group flex min-h-28 w-full flex-col items-start justify-between rounded-2xl border p-4 text-left transition-all sm:min-h-36 sm:p-5 ${selected ? "border-primary bg-primary/10 ring-1 ring-primary/40" : "border-border bg-card/60 hover:border-primary/50 hover:bg-card"}`}>
                      <span className={`flex size-7 items-center justify-center rounded-full border text-xs ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground group-hover:border-primary/50"}`}>{selected ? <Check className="size-4" /> : index + 1}</span>
                      <span className="mt-4 text-sm font-semibold leading-6 sm:text-base">{choice.label}</span>
                    </motion.button>;
                  })}
                </div>
              </motion.section>
            ) : screen === "transition" ? (
              <motion.section key="lens-transition" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={transition} aria-live="polite" className="flex min-h-64 flex-col justify-center">
                <span className="mb-5 flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary"><Check className="size-5" /></span>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Got it.</h1>
                <p className="mt-2 text-sm text-muted-foreground">One more everyday situation.</p>
              </motion.section>
            ) : screen === "result" ? (
              <motion.section key="lens-result" initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="w-full max-w-2xl">
                <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><ShieldCheck className="size-4" /> Your Lens</p>
                <h1 className="font-display text-4xl font-semibold leading-[1.06] tracking-[-0.04em] sm:text-6xl">We’ll keep an eye on what matters to you.</h1>
                <div className="mt-7 grid gap-2 sm:grid-cols-2">
                  {highlightedInterests.map((item) => <div key={item.key} className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/50 px-4 py-3"><span className="size-2 rounded-full bg-primary" /><span className="text-sm font-medium">{item.label}</span></div>)}
                </div>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button onClick={onContinue} className="h-12 w-full rounded-xl px-6 text-sm sm:w-auto">Continue to your profile <ArrowRight className="size-4" /></Button>
                </div>
              </motion.section>
            ) : null}
          </AnimatePresence>

          <aside className="hidden lg:block">
            {screen === "result" ? (
              <div className="rounded-3xl border border-border bg-card/65 p-7">
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">What you noticed</span>
                <div className="mt-7 space-y-5">{LENS_INTEREST_LABELS.map((item) => <div key={item.key}><div className="mb-2 flex justify-between text-sm"><span>{item.label}</span><span className="tabular-nums text-muted-foreground">{interests[item.key]}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, interests[item.key] * 25)}%` }} transition={{ duration: reducedMotion ? 0 : 0.6 }} className="h-full rounded-full bg-primary" /></div></div>)}</div>
              </div>
            ) : screen === "intro" ? (
              <div className="relative overflow-hidden rounded-3xl border border-border bg-card/65 p-7">
                <div className="absolute -right-12 -top-16 size-48 rounded-full bg-primary/10 blur-3xl" />
                <p className="relative mt-10 font-display text-3xl font-medium leading-tight">“The small details often tell you the most.”</p>
              </div>
            ) : (
              <div className="rounded-3xl border border-border bg-card/65 p-7">
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Your check-in</span>
                <p className="mt-2 text-sm text-muted-foreground">{answersMade} of 5 answered</p>
                <div className="mt-6 space-y-3">{LENS_SCENARIOS.map((item, index) => { const answer = answers[`scenario${index + 1}` as keyof LensAnswer]; return <div key={item.label} className="flex items-start gap-3 border-t border-border/70 pt-3"><span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] ${answer ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>{answer ? <Check className="size-3" /> : String(index + 1)}</span><span className="text-xs leading-5 text-muted-foreground">{item.label.toLowerCase()}{index === scenarioIndex ? <span className="ml-2 text-primary">Current</span> : ""}</span></div>; })}</div>
              </div>
            )}
          </aside>
        </div>
        <footer className="border-t border-border/70 py-3 text-[11px] text-muted-foreground">Candid · Kenya</footer>
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
