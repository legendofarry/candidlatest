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
  Building2,
  Check,
  Flame,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Music2,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  X as XIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { requiresEmailVerification } from "@/lib/email-verification";
import { notify as toast } from "@/lib/notifications-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProfileCoverPicker, ProfilePhotoPicker } from "@/components/site/profile-photo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkUsername,
  completeOnboarding,
  getOnboardingState,
  getUsernameSuggestions,
  updateMyUsername,
} from "@/lib/onboarding.functions";
import { getFilterOptions } from "@/lib/public.functions";

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
  const loadCompanies = useServerFn(getFilterOptions);

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [mediaStage, setMediaStage] = useState<"profile" | "cover">("profile");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
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
  const [accountType, setAccountType] = useState<"individual" | "company">("individual");
  const [companyOptions, setCompanyOptions] = useState<Array<{
    id: string;
    name: string;
    slug: string;
    industry: string | null;
  }>>([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [companySearch, setCompanySearch] = useState("");
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
        setCoverUrl(result.coverUrl);
        const storedAccountType = window.sessionStorage.getItem("candid:signup-account-type");
        setAccountType(storedAccountType === "company" || result.accountType === "company" ? "company" : "individual");
        setSelectedCompanyIds(result.companyIds.map((company) => company.company_id));
        setMediaStage(result.photoUrl ? "cover" : "profile");
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

  useEffect(() => {
    let active = true;
    void loadCompanies()
      .then((result) => {
        if (!active) return;
        setCompanyOptions(
          result.companies
            .filter((company) => Boolean(company.id && company.name && company.slug))
            .map((company) => ({
              id: company.id,
              name: company.name,
              slug: company.slug,
              industry: company.industry ?? null,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {
        if (active) setCompanyOptions([]);
      });
    return () => {
      active = false;
    };
  }, [loadCompanies]);

  async function generateAliases() {
    setLoadingSuggestions(true);
    setSuggestionError(null);
    setUsername("");
    setMessage(null);
    try {
      const result = await getSuggestions({ data: { seed: "Candid" } });
      setUsernameSuggestions(result.suggestions);
      if (!result.suggestions.length) {
        setSuggestionError(
          "We couldn’t find an available suggestion. Try again or choose your own.",
        );
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
          accountType,
          companyIds: accountType === "company" ? [] : selectedCompanyIds,
          joinGroupIds: accountType !== "company" ? selectedCompanyIds : [],
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
      try {
        if (accountType === "company") window.sessionStorage.setItem("candid:company-account-created", "1");
        window.sessionStorage.removeItem("candid:signup-account-type");
      } catch {
        // Keep onboarding usable if browser storage is unavailable.
      }
      navigate({ to: accountType === "company" ? "/company/setup" : "/" });
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
    <main className="relative isolate min-h-dvh w-full overflow-hidden bg-muted/30 px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-48 size-[32rem] rounded-full bg-primary/[0.045] blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-2xl lg:max-w-6xl">
        <header className="mb-8 flex items-center justify-between border-b border-border/70 pb-5 sm:mb-10 sm:pb-6">
          <div className="flex items-center gap-2 font-display text-base font-semibold sm:text-sm">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground sm:size-8">
              <Flame className="size-5 sm:size-4" />
            </span>
            Candid
          </div>
          {editUsername ? (
            <button
              type="button"
              onClick={() => void navigate({ to: "/profile" })}
              className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground sm:min-h-0 sm:text-xs"
            >
              <ArrowLeft className="size-3.5" /> Cancel edit
            </button>
          ) : (
            <span className="text-sm text-muted-foreground sm:text-xs">Your account</span>
          )}
        </header>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-start lg:gap-10 xl:gap-16">
          <div>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="mb-7"
          >
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-primary sm:text-xs">
              {editUsername ? "Update your public username" : `Account setup · ${step + 1} of 4`}
            </p>
            <h1 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.08] xl:text-5xl">
              {step === 0
                ? !usernameAcknowledged
                  ? "Your username is public"
                  : !usernameChoice
                    ? "How would you like to choose it?"
                    : usernameChoice === "own"
                      ? "Choose your username"
                      : "Pick a suggested username"
                : step === 1
                  ? mediaStage === "profile"
                    ? "Add a profile photo"
                    : "Add a cover photo"
                : step === 2
                  ? "Add your links"
                  : "Where have you worked?"}
            </h1>
            <p className="mt-3 max-w-lg text-base leading-7 text-muted-foreground sm:text-base">
              {step === 0
                ? !usernameAcknowledged
                  ? "The username you choose can identify you to other members when you post a story or comment. Your email and legal name are not displayed, but avoid using your real name or details that could identify you."
                  : !usernameChoice
                    ? "You can choose a unique username yourself, or let Candid suggest available options. You can change your mind before continuing."
                    : usernameChoice === "own"
                      ? "Choose a name you’re comfortable having shown on your stories and comments. We’ll check that it’s available."
                      : "Choose one of these available names, or ask Candid for another set."
                : step === 1
                  ? mediaStage === "profile"
                    ? "Choose a profile photo or character avatar. This is optional, and you can add one later."
                    : "Choose a cover photo for the top of your public profile. This is optional, and you can change it anytime."
                : step === 2
                  ? "Social links are optional. Add any you want people to find on your profile."
                  : "Choose employers you have worked for. This list stays private on your account; you can search every company in Candid."}
            </p>
          </motion.div>

          {!editUsername ? (
            <div className="mb-6 grid grid-cols-4 gap-3 lg:mt-8 lg:mb-0" aria-label={`Profile setup step ${step + 1} of 4`}>
              {["Username", "Profile", "Links", "Companies"].map((label, index) => (
                <div key={label} className="min-w-0">
                  <div className="h-1 overflow-hidden rounded-full bg-secondary">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={false}
                      animate={{ width: step >= index ? "100%" : "0%" }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                    />
                  </div>
                  <span className={`mt-2 block truncate text-sm font-medium sm:text-[11px] ${step === index ? "text-foreground" : "text-muted-foreground/70"}`}>
                    0{index + 1} <span className="hidden sm:inline">· {label}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {step === 0 ? (
              <motion.section
                key="username"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6 lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l lg:border-border lg:bg-transparent lg:py-0 lg:pr-0 lg:pl-8 lg:shadow-none xl:pl-12"
              >
                {!usernameAcknowledged ? (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-5 sm:p-6">
                      <span className="flex size-11 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                        <ShieldCheck className="size-6" />
                      </span>
                      <h2 className="mt-4 text-xl font-semibold tracking-tight">
                        Your name, your choice
                      </h2>
                      <p className="mt-2 text-base leading-7 text-muted-foreground sm:text-sm sm:leading-6">
                        Your username appears next to the stories and comments you share. Other
                        members may recognize it, so choose a name you’re comfortable using
                        publicly.
                      </p>
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:bg-secondary/40">
                      <input
                        type="checkbox"
                        checked={usernameAcknowledgementChecked}
                        onChange={(event) =>
                          setUsernameAcknowledgementChecked(event.target.checked)
                        }
                        className="mt-1 size-4 accent-primary"
                      />
                      <span className="text-base leading-6 sm:text-sm sm:leading-5">
                        I understand that my username can be seen on my stories and comments.
                      </span>
                    </label>
                    <Button
                      className="h-12 w-full text-base glow-primary sm:h-10 sm:text-sm"
                      disabled={!usernameAcknowledgementChecked}
                      onClick={() => setUsernameAcknowledged(true)}
                    >
                      Continue <ArrowRight className="size-4" />
                    </Button>
                  </div>
                ) : !usernameChoice ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => {
                        setUsernameChoice("own");
                        setUsernameSuggestions([]);
                        setUsername("");
                        setMessage(null);
                      }}
                      className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-background p-4 text-left transition-all hover:border-primary/50 hover:bg-secondary/40 sm:p-5"
                    >
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-foreground">
                        <Pencil className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">I’ll choose my own</span>
                        <span className="mt-1 block text-base text-muted-foreground sm:text-sm">
                          Pick a unique username you want to post under.
                        </span>
                      </span>
                      <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </button>
                    <button
                      type="button"
                      disabled={loadingSuggestions}
                      onClick={() => {
                        setUsernameChoice("generated");
                        void generateAliases();
                      }}
                      className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-background p-4 text-left transition-all hover:border-primary/50 hover:bg-secondary/40 disabled:opacity-60 sm:p-5"
                    >
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Sparkles className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">Let Candid choose for me</span>
                        <span className="mt-1 block text-base text-muted-foreground sm:text-sm">
                          We’ll suggest available names you can pick from.
                        </span>
                      </span>
                      {loadingSuggestions ? (
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      ) : (
                        <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <button
                      type="button"
                      onClick={() => {
                        setUsernameChoice(null);
                        setUsername("");
                        setUsernameSuggestions([]);
                        setSuggestionError(null);
                        setMessage(null);
                      }}
                      className="inline-flex min-h-11 items-center gap-2 text-base text-muted-foreground hover:text-foreground sm:min-h-0 sm:text-sm"
                    >
                      <ArrowLeft className="size-4" /> Choose another option
                    </button>
                    {usernameChoice === "own" ? (
                      <div className="space-y-3">
                        <Label htmlFor="username" className="text-base sm:text-sm">Your unique username</Label>
                        <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 focus-within:border-primary">
                          <AtSign className="size-4 shrink-0 text-muted-foreground" />
                          <Input
                            id="username"
                            autoFocus
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={20}
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            placeholder="yourname"
                            className="border-0 bg-transparent px-0 text-base focus-visible:ring-0 sm:text-sm"
                          />
                        </div>
                        <p className="text-base leading-7 text-muted-foreground sm:text-xs sm:leading-5">
                          Use 3–20 letters, numbers, dots, or underscores. Don’t use your real name
                          if you want to stay anonymous.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-base font-medium sm:text-sm">Username ideas</p>
                        <p className="text-base text-muted-foreground sm:text-xs">
                          We’ll check availability when you select one.
                        </p>
                        {loadingSuggestions ? (
                          <div className="flex items-center gap-2 rounded-xl bg-secondary/50 p-4 text-base text-muted-foreground sm:text-sm">
                            <Loader2 className="size-4 animate-spin" /> Generating username ideas…
                          </div>
                        ) : usernameSuggestions.length ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {usernameSuggestions.map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                aria-pressed={username === suggestion}
                                onClick={() => setUsername(suggestion)}
                                className={cn(
                                  "min-h-12 rounded-xl border px-4 py-3 text-left text-base font-medium transition-colors sm:text-sm",
                                  username === suggestion
                                    ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
                                    : "border-border bg-background hover:border-primary/50",
                                )}
                              >
                                @{suggestion}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {suggestionError ? (
                          <p role="status" className="text-base text-muted-foreground sm:text-sm">
                            {suggestionError}
                          </p>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void generateAliases()}
                          disabled={loadingSuggestions}
                          className="h-11 text-base sm:h-9 sm:text-sm"
                        >
                          <Sparkles className="size-4" /> Generate more
                        </Button>
                      </div>
                    )}
                    {username ? (
                      <p
                        aria-live="polite"
                        className={`text-base sm:text-sm ${status === "available" ? "text-verified" : status === "taken" || status === "invalid" ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {status === "checking"
                          ? "Checking username availability…"
                          : status === "available"
                            ? "This username is available."
                            : status === "taken" || status === "invalid"
                              ? (message ?? "Choose another username.")
                              : "Checking username availability…"}
                      </p>
                    ) : null}
                    {submitError ? (
                      <div
                        role="alert"
                        className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 p-3 text-base text-danger sm:text-sm"
                      >
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                        <p className="min-w-0 break-words">{submitError}</p>
                      </div>
                    ) : null}
                    {editUsername ? (
                      <Button
                      className="h-12 w-full text-base glow-primary sm:h-10 sm:text-sm"
                        disabled={status !== "available" || saving}
                        onClick={() => void saveAliasChange()}
                      >
                        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                        {saving ? "Saving username…" : "Save username"}
                      </Button>
                    ) : (
                      <Button
                      className="h-12 w-full text-base glow-primary sm:h-10 sm:text-sm"
                        disabled={status !== "available" || saving}
                        onClick={() => setStep(1)}
                      >
                        Use @{username} <ArrowRight className="size-4" />
                      </Button>
                    )}
                  </div>
                )}
              </motion.section>
            ) : step === 1 ? (
              <motion.section
                key={mediaStage === "profile" ? "profile-photo" : "cover-photo"}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6 lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l lg:border-border lg:bg-transparent lg:py-0 lg:pr-0 lg:pl-8 lg:shadow-none xl:pl-12"
              >
                {mediaStage === "profile" ? (
                  <>
                    <ProfilePhotoPicker
                      photoUrl={photoUrl}
                      initials={(user?.email?.[0] ?? "C").toUpperCase()}
                      largeMobileText
                      avatarClassName="size-28 border-2 border-border sm:size-20"
                      onSaved={(nextPhotoUrl) => {
                        setPhotoUrl(nextPhotoUrl);
                        setMediaStage("cover");
                        if (user) {
                          queryClient.setQueryData(
                            ["onboarding-state", user.uid],
                            (previous: unknown) =>
                              previous && typeof previous === "object"
                                ? { ...previous, photoUrl: nextPhotoUrl }
                                : previous,
                          );
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setMediaStage("cover")}
                      className="min-h-11 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-0 sm:text-xs"
                    >
                      Skip profile photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="min-h-11 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-0 sm:text-xs"
                    >
                      Back to username
                    </button>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div>
                        <p className="text-base font-medium sm:text-sm">Your cover photo</p>
                        <p className="mt-1 text-base leading-7 text-muted-foreground sm:text-xs sm:leading-normal">
                          This appears across the top of your public profile. You can change it
                          anytime.
                        </p>
                      </div>
                      <div className="relative h-32 overflow-hidden rounded-2xl border border-border bg-secondary sm:h-40">
                        <ProfileCoverPicker
                          coverUrl={coverUrl}
                          largeMobileText
                          onSaved={(nextCoverUrl) => {
                            setCoverUrl(nextCoverUrl);
                            if (user) {
                              queryClient.setQueryData(
                                ["onboarding-state", user.uid],
                                (previous: unknown) =>
                                  previous && typeof previous === "object"
                                    ? { ...previous, coverUrl: nextCoverUrl }
                                    : previous,
                              );
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button className="h-12 flex-1 text-base glow-primary sm:h-10 sm:text-sm" onClick={() => setStep(2)}>
                        {coverUrl ? "Continue" : "Continue without cover photo"}{" "}
                        <ArrowRight className="size-4" />
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMediaStage("profile")}
                      className="min-h-11 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-0 sm:text-xs"
                    >
                      Back to profile photo
                    </button>
                  </>
                )}
              </motion.section>
            ) : step === 2 ? (
              <motion.section
                key="socials"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6 lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l lg:border-border lg:bg-transparent lg:py-0 lg:pr-0 lg:pl-8 lg:shadow-none xl:pl-12"
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
                        className="border-0 bg-transparent px-0 text-base focus-visible:ring-0 sm:text-sm"
                      />
                    </motion.div>
                  ))}
                </div>

                {submitError ? (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 p-3 text-base text-danger sm:text-sm"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <p className="min-w-0 break-words">{submitError}</p>
                  </div>
                ) : null}

                <Button
                  className="mt-6 h-12 w-full text-base glow-primary sm:h-10 sm:text-sm"
                  disabled={saving}
                  onClick={() => setStep(3)}
                >
                  Continue to companies <ArrowRight className="size-4" />
                </Button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setStep(3)}
                  className="mt-3 min-h-11 w-full text-center text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50 sm:min-h-0 sm:text-sm"
                >
                  Skip links
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mt-3 min-h-11 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-0 sm:text-xs"
                >
                  Back
                </button>
              </motion.section>
            ) : (
              <motion.section
                key="companies"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-5 border-y border-border py-5 lg:border-y-0 lg:border-l lg:py-0 lg:pl-8 xl:pl-12"
              >
                {accountType === "company" ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-4 border-b border-border pb-5">
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Building2 className="size-6" />
                      </span>
                      <div>
                        <h2 className="text-lg font-semibold">Company accounts skip work history</h2>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          You can request access to an existing company page next. It stays read-only until Candid verifies the request.
                        </p>
                      </div>
                    </div>
                    <Button className="h-12 w-full text-base glow-primary sm:h-11 sm:text-sm" disabled={saving} onClick={() => void submit()}>
                      {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                      {saving ? "Setting up your account…" : "Finish company account setup"}
                      {!saving ? <ArrowRight className="size-4" /> : null}
                    </Button>
                    <button type="button" onClick={() => setStep(2)} className="min-h-11 w-full text-sm text-muted-foreground hover:text-foreground">Back</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-semibold">Select your employers</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">Optional · only you can see this work-history list.</p>
                    </div>
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={companySearch}
                        onChange={(event) => setCompanySearch(event.target.value)}
                        placeholder="Search every company…"
                        className="h-12 rounded-full pl-11"
                      />
                    </label>
                    <div className="max-h-[min(45dvh,26rem)] overflow-y-auto border-y border-border" role="listbox" aria-label="Companies you have worked for" aria-multiselectable="true">
                      {companyOptions
                        .filter((company) => company.name.toLocaleLowerCase().includes(companySearch.trim().toLocaleLowerCase()))
                        .slice(0, 100)
                        .map((company) => {
                          const selected = selectedCompanyIds.includes(company.id);
                          return (
                            <button
                              key={company.id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => setSelectedCompanyIds((current) => selected
                                ? current.filter((id) => id !== company.id)
                                : current.length >= 20 ? current : [...current, company.id])}
                              className="flex min-h-16 w-full items-center gap-3 border-b border-border/70 px-2 text-left transition-colors hover:bg-secondary/50"
                            >
                              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                                {selected ? <Check className="size-5" /> : <Building2 className="size-5" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{company.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">{company.industry ?? "Company"} · #{company.slug}</span>
                              </span>
                              {selected ? <span className="text-xs text-primary">Selected</span> : null}
                            </button>
                          );
                        })}
                      {!companyOptions.length ? <p className="px-2 py-6 text-sm text-muted-foreground">Company list is loading or temporarily unavailable.</p> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{selectedCompanyIds.length} selected · categories come from the company directory.</p>
                    {selectedCompanyIds.length ? (
                      <p className="border-y border-border py-4 text-xs leading-5 text-muted-foreground">
                        You’ll join each selected company group. Other group members can see your membership, but your private work-history list stays hidden. You can leave any group later.
                      </p>
                    ) : null}
                    {submitError ? <p role="alert" className="text-sm text-danger">{submitError}</p> : null}
                    <Button className="h-12 w-full text-base glow-primary sm:h-11 sm:text-sm" disabled={saving} onClick={() => void submit()}>
                      {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                      {saving ? "Finishing setup…" : selectedCompanyIds.length ? `Finish as @${username}` : "Skip and finish setup"}
                      {!saving ? <ArrowRight className="size-4" /> : null}
                    </Button>
                    <button type="button" disabled={saving} onClick={() => setStep(2)} className="min-h-11 w-full text-sm text-muted-foreground hover:text-foreground">Back to links</button>
                  </>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>
        <footer className="mt-6 pb-2 text-center text-sm leading-6 text-muted-foreground sm:text-xs sm:leading-5">
          Your alias appears publicly. Candid cannot guarantee complete anonymity.
        </footer>
      </div>
    </main>
  );
}
