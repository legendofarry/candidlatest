import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  LoaderCircle,
  MapPin,
  PenLine,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { notify as toast } from "@/lib/notifications-store";
import { getFilterOptions } from "@/lib/public.functions";
import {
  createStory,
  ensureProfile,
  findOrCreateCompany,
  getStoryForEdit,
  updateStory,
} from "@/lib/actions.functions";
import { generateStoryField } from "@/lib/story-draft.functions";
import { findCompanyMatches } from "@/lib/company-match";
import { knownKenyanEmployers } from "@/lib/kenyan-employers";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MentionTextarea } from "@/components/site/mention-textarea";
import { ConfirmDialog } from "@/components/site/confirm-dialog";
import { FloatingBackButton } from "@/components/site/floating-back-button";
import { AnonymousPostingToggle } from "@/components/site/anonymous-posting-toggle";
import { cn } from "@/lib/utils";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";
import { allKenyaAreas, areasForCounty, KENYA_LOCATIONS } from "@/lib/kenya-locations";
import { CommunityPostComposer } from "@/components/site/community-post-composer";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { getPrivacySettings } from "@/lib/messaging.functions";

const filtersQuery = queryOptions({ queryKey: ["filters"], queryFn: () => getFilterOptions() });

const REASONS = [
  "delayed salary",
  "unpaid overtime",
  "harassment",
  "tribalism / nepotism",
  "no contract",
  "wrongful dismissal",
  "no statutory deductions",
  "toxic management",
  "good exit",
] as const;

const TENURES = ["Under 6 months", "6–12 months", "1–2 years", "3–5 years", "5+ years"];
const LEVELS = ["Intern", "Entry level", "Mid level", "Senior", "Management"];
const STEP_DETAILS = [
  {
    title: "Where did you work?",
    detail: "Start with the employer and a little location context.",
  },
  { title: "What made you leave?", detail: "Choose every reason that reflects your experience." },
  {
    title: "What was your role?",
    detail: "A few details help people understand your perspective.",
  },
  {
    title: "Tell it in your own words",
    detail: "Write it yourself, or draft either field with AI.",
  },
  { title: "Review before sharing", detail: "Check the details and keep yourself safe." },
] as const;
type StoryDraft = {
  version: 1;
  step: number;
  companyName: string;
  industry: string;
  county: string;
  area: string;
  companyMapUrl: string;
  reasons: string[];
  customReason: string;
  tenure: string;
  roleLevel: string;
  position: string;
  title: string;
  body: string;
  wouldReturn: boolean | null;
};

export const Route = createFileRoute("/post")({
  validateSearch: (search: Record<string, unknown>): { edit?: string; mode?: "announcement" } => ({
    ...(typeof search["edit"] === "string" ? { edit: search["edit"] } : {}),
    ...(search["mode"] === "announcement" ? { mode: "announcement" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Share your exit story | Candid" },
      {
        name: "description",
        content:
          "Tell Kenyan job seekers why you really left. Five quick steps, screened before publishing.",
      },
      { property: "og:title", content: "Share your exit story" },
      {
        property: "og:description",
        content: "Screened and attached to the employer — help the next person decide.",
      },
    ],
  }),
  component: PostPage,
});

function PostPage() {
  const { mode } = Route.useSearch();
  return mode === "announcement" ? <CommunityPostComposer /> : <WorkplaceStoryComposer />;
}

function WorkplaceStoryComposer() {
  const { edit: editStoryId } = Route.useSearch();
  const { data: filters } = useSuspenseQuery(filtersQuery);
  const { user, loading } = useAuth();
  const fetchOnboarding = useServerFn(getOnboardingState);
  const fetchPrivacySettings = useServerFn(getPrivacySettings);
  const { data: privacySettings } = useQuery({
    queryKey: ["privacy-settings", user?.uid ?? null],
    queryFn: () => fetchPrivacySettings(),
    enabled: Boolean(user),
  });
  const { data: account } = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? null],
    queryFn: () => fetchOnboarding(),
    enabled: Boolean(user),
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const ensure = useServerFn(ensureProfile);
  const findCompany = useServerFn(findOrCreateCompany);
  const create = useServerFn(createStory);
  const fetchStoryForEdit = useServerFn(getStoryForEdit);
  const generateStoryFieldFn = useServerFn(generateStoryField);
  const update = useServerFn(updateStory);

  const [step, setStep] = useState(0);
  const [stepDirection, setStepDirection] = useState(1);
  const [companyName, setCompanyName] = useState("");
  const [employerSuggestionsOpen, setEmployerSuggestionsOpen] = useState(false);
  const [industry, setIndustry] = useState("");
  const [county, setCounty] = useState("");
  const [area, setArea] = useState("");
  const [showAllCounties, setShowAllCounties] = useState(false);
  const [showAllAreas, setShowAllAreas] = useState(false);
  const [companyMapUrl, setCompanyMapUrl] = useState("");
  const [pinningLocation, setPinningLocation] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [customReason, setCustomReason] = useState("");
  const [tenure, setTenure] = useState("");
  const [roleLevel, setRoleLevel] = useState("");
  const [position, setPosition] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [aiGeneratingField, setAiGeneratingField] = useState<"title" | "body" | null>(null);
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null);
  const [publishError, setPublishError] = useState("");
  const [editLoading, setEditLoading] = useState(Boolean(editStoryId));
  const [editLoaded, setEditLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [savedDraftKey, setSavedDraftKey] = useState<string | null>(null);
  const [draftReadyForUser, setDraftReadyForUser] = useState<string | null>(null);
  const storageFailureNotified = useRef(false);
  const stepAnswersRef = useRef<HTMLDivElement>(null);
  const reduceMotion = Boolean(useReducedMotion());
  const aiDescriptionId = useId();
  const storyDraftUserId = user?.uid;
  const isEditing = Boolean(editStoryId);

  useEffect(() => {
    if (!isEditing && privacySettings)
      setAnonymous(privacySettings.anonymous_contributions_default);
  }, [isEditing, privacySettings]);

  useEffect(() => {
    if (!editStoryId || !user) {
      setEditLoading(false);
      return;
    }
    let cancelled = false;
    setEditLoading(true);
    void fetchStoryForEdit({ data: { story_id: editStoryId } })
      .then((story) => {
        if (cancelled) return;
        setCompanyName(story.company_name);
        setIndustry(story.industry ?? "");
        setCounty(story.county ?? "");
        setArea(story.area ?? "");
        setCompanyMapUrl(story.company_location_suggestion ?? "");
        setReasons(story.reasons);
        setTenure(story.tenure ?? "");
        setRoleLevel(story.role_level ?? "");
        setPosition(story.position ?? "");
        setTitle(story.title);
        setBody(story.body);
        setWouldReturn(story.would_work_again);
        setEditLoaded(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Could not load this story.";
          setPublishError(message);
          toast.error("Could not load story", { description: message });
        }
      })
      .finally(() => {
        if (!cancelled) setEditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editStoryId, fetchStoryForEdit, user]);

  function goToStep(nextStep: number) {
    setStepDirection(nextStep >= step ? 1 : -1);
    setStep(nextStep);
  }

  async function generateAiStoryField(field: "title" | "body") {
    if (aiGeneratingField) return;
    setAiGeneratingField(field);
    try {
      const result = await generateStoryFieldFn({
        data: {
          field,
          company: companyName,
          industry,
          county,
          reasons,
          customReason,
          position,
          tenure,
          roleLevel,
          wouldReturn,
          currentValue: field === "title" ? title : body,
        },
      });
      if (field === "title") setTitle(result.value);
      else setBody(result.value);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not draft this field.");
    } finally {
      setAiGeneratingField(null);
    }
  }

  const dirty =
    companyName.trim().length > 0 ||
    industry.trim().length > 0 ||
    county.trim().length > 0 ||
    area.trim().length > 0 ||
    companyMapUrl.trim().length > 0 ||
    reasons.length > 0 ||
    customReason.trim().length > 0 ||
    tenure.length > 0 ||
    roleLevel.length > 0 ||
    position.trim().length > 0 ||
    title.trim().length > 0 ||
    body.trim().length > 0 ||
    wouldReturn !== null;

  const storyDraft: StoryDraft = {
    version: 1,
    step,
    companyName,
    industry,
    county,
    area,
    companyMapUrl,
    reasons,
    customReason,
    tenure,
    roleLevel,
    position,
    title,
    body,
    wouldReturn,
  };
  const storyDraftKey = JSON.stringify(storyDraft);
  const hasUnsavedDraftChanges = dirty && savedDraftKey !== storyDraftKey;

  useEffect(() => {
    stepAnswersRef.current?.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [reduceMotion, step]);

  useEffect(() => {
    if (isEditing || !storyDraftUserId) {
      setDraftReadyForUser(null);
      return;
    }
    const storageKey = `candid:story-draft:${storyDraftUserId}`;
    try {
      const rawDraft = window.localStorage.getItem(storageKey);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft) as Partial<StoryDraft>;
        if (parsed.version !== 1) throw new Error("Unsupported draft version");
        const restored: StoryDraft = {
          version: 1,
          step: Number.isInteger(parsed.step) ? Math.min(4, Math.max(0, parsed.step!)) : 0,
          companyName: typeof parsed.companyName === "string" ? parsed.companyName : "",
          industry: typeof parsed.industry === "string" ? parsed.industry : "",
          county: typeof parsed.county === "string" ? parsed.county : "",
          area: typeof parsed.area === "string" ? parsed.area : "",
          companyMapUrl: typeof parsed.companyMapUrl === "string" ? parsed.companyMapUrl : "",
          reasons: Array.isArray(parsed.reasons)
            ? parsed.reasons
                .filter((reason): reason is string => typeof reason === "string")
                .slice(0, 10)
            : [],
          customReason: typeof parsed.customReason === "string" ? parsed.customReason : "",
          tenure: typeof parsed.tenure === "string" ? parsed.tenure : "",
          roleLevel: typeof parsed.roleLevel === "string" ? parsed.roleLevel : "",
          position: typeof parsed.position === "string" ? parsed.position : "",
          title: typeof parsed.title === "string" ? parsed.title : "",
          body: typeof parsed.body === "string" ? parsed.body : "",
          wouldReturn: typeof parsed.wouldReturn === "boolean" ? parsed.wouldReturn : null,
        };
        setStep(restored.step);
        setCompanyName(restored.companyName);
        setIndustry(restored.industry);
        setCounty(restored.county);
        setArea(restored.area);
        setCompanyMapUrl(restored.companyMapUrl);
        setReasons(restored.reasons);
        setCustomReason(restored.customReason);
        setTenure(restored.tenure);
        setRoleLevel(restored.roleLevel);
        setPosition(restored.position);
        setTitle(restored.title);
        setBody(restored.body);
        setWouldReturn(restored.wouldReturn);
        setSavedDraftKey(JSON.stringify(restored));
      }
    } catch {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore unavailable browser storage.
      }
    } finally {
      setDraftReadyForUser(storyDraftUserId);
    }
  }, [isEditing, storyDraftUserId]);

  useEffect(() => {
    if (isEditing || !storyDraftUserId || draftReadyForUser !== storyDraftUserId || !dirty) return;
    try {
      window.localStorage.setItem(`candid:story-draft:${storyDraftUserId}`, storyDraftKey);
      setSavedDraftKey(storyDraftKey);
      storageFailureNotified.current = false;
    } catch {
      if (!storageFailureNotified.current) {
        toast.error("Could not save on this device", {
          description: "Your browser storage may be full or disabled. Use Save draft to retry.",
        });
        storageFailureNotified.current = true;
      }
    }
  }, [draftReadyForUser, dirty, isEditing, storyDraftKey, storyDraftUserId]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-8 text-center">
        <ShieldCheck className="mx-auto size-8 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold">Sign in to share a story</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An account helps prevent spam and abuse. Your story shows your Candid handle; your email
          and legal name are never displayed.
        </p>
        <Button asChild className="mt-5">
          <Link to="/auth">Sign in or create an account</Link>
        </Button>
      </div>
    );
  }

  if (editLoading || (isEditing && !editLoaded && !publishError)) {
    return (
      <p className="mx-auto max-w-lg py-16 text-center text-sm text-muted-foreground">
        Loading your story…
      </p>
    );
  }

  const steps = ["Employer", "What happened", "Your role", "Your story", "Review"];

  const matches = findCompanyMatches(companyName, filters.companies, 5);
  const companyNeedle = companyName.trim().toLocaleLowerCase();
  const companySuggestions = [
    ...matches.map((match) => ({
      name: match.name,
      industry: match.industry ?? "",
      verified: match.verified,
    })),
    ...knownKenyanEmployers
      .filter(
        (employer) =>
          !companyNeedle ||
          employer.name.toLocaleLowerCase().includes(companyNeedle) ||
          employer.industry.toLocaleLowerCase().includes(companyNeedle),
      )
      .map((employer) => ({ ...employer, verified: false })),
  ]
    .filter(
      (employer, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.name.trim().toLocaleLowerCase() === employer.name.trim().toLocaleLowerCase(),
        ) === index,
    )
    .slice(0, 8);
  const areaSuggestions = (county ? areasForCounty(county) : allKenyaAreas()) ?? [];
  const countyOptions = Object.keys(KENYA_LOCATIONS).sort((a, b) => a.localeCompare(b));
  const popularCounties = ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Kiambu", "Uasin Gishu"];
  const visibleCounties = showAllCounties ? countyOptions : popularCounties;

  function pinCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error("Location pinning is not available in this browser.");
      return;
    }
    setPinningLocation(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const coordinates = `${coords.latitude.toFixed(5)},${coords.longitude.toFixed(5)}`;
        setCompanyMapUrl(`https://maps.google.com/?q=${coordinates}`);
        setPinningLocation(false);
        toast.success("Private location pin added to your story.");
      },
      () => {
        setPinningLocation(false);
        toast.error("Could not get your location. Check your browser permission and try again.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }
  function saveDraft() {
    if (!user || !dirty) return;
    try {
      window.localStorage.setItem(`candid:story-draft:${user.uid}`, storyDraftKey);
      setSavedDraftKey(storyDraftKey);
    } catch {
      toast.error("Could not save draft", {
        description: "Check your device storage and try again.",
      });
    }
  }

  function clearSavedDraft() {
    try {
      if (user) window.localStorage.removeItem(`candid:story-draft:${user.uid}`);
    } catch {
      // Clearing a local draft must not block leaving or publishing the form.
    }
    setSavedDraftKey(null);
  }

  function addCustomReason(raw: string) {
    const value = raw.replace(/,+$/, "").trim();
    if (value.length < 2) return;
    if (reasons.some((r) => r.toLowerCase() === value.toLowerCase())) {
      setCustomReason("");
      return;
    }
    if (reasons.length >= 10) return;
    setReasons((current) => [...current, value]);
    setCustomReason("");
  }

  async function submit() {
    setPublishError("");
    setSubmitting(true);
    try {
      if (
        companyName.trim().length < 2 ||
        /^(n\/?a|none|unknown|not applicable)$/i.test(companyName.trim())
      ) {
        throw new Error(
          "Enter the employer's name. Use the employer privacy option if you do not want it shown publicly.",
        );
      }
      await ensure({ data: { county: county || null } });
      const company = await findCompany({
        data: { name: companyName.trim(), industry: industry || null, county: county || null },
      });

      const storyData = {
        company_id: company.id,
        title: title.trim(),
        body: body.trim(),
        reasons,
        role_level: roleLevel || null,
        position: position.trim() || null,
        county: county || null,
        area: area.trim() || null,
        company_public: true,
        company_location_suggestion: companyMapUrl.trim() || null,
        tenure: tenure || null,
        industry: industry || company.industry || null,
        would_work_again: wouldReturn,
        ...(isEditing ? {} : { is_anonymous: anonymous }),
      };
      const result = isEditing
        ? await update({ data: { ...storyData, story_id: editStoryId! } })
        : await create({ data: storyData });

      await queryClient.invalidateQueries({ queryKey: ["company-scores"] });
      clearSavedDraft();
      if (!isEditing && result.status === "published") {
        navigate({ to: "/stories/$id", params: { id: result.id } });
      } else {
        navigate({ to: "/profile" });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while publishing your story.";
      setPublishError(message);
      toast.error("Could not publish story", { description: message });
    } finally {
      setSubmitting(false);
    }
  }

  const canContinue = [
    companyName.trim().length > 1,
    reasons.length > 0,
    true,
    title.trim().length >= 8 && body.trim().length >= 60,
    true,
  ][step];

  return (
    <div className="h-[calc(100dvh-4rem)] min-h-0 w-full overflow-hidden bg-background md:h-dvh">
      <div className="relative h-full min-h-0 w-full overflow-hidden border-0 bg-transparent shadow-none md:bg-card/85 md:shadow-2xl md:backdrop-blur-xl">
        <FloatingBackButton
          onClick={() => navigate({ to: "/" })}
          className="hidden md:inline-flex"
        />

        <div className="grid h-full min-h-0 md:grid-cols-[1.05fr_1.2fr]">
          <div className="relative hidden overflow-hidden border-r border-border/80 bg-[linear-gradient(135deg,#0f172a_0%,#111827_30%,#0f172a_100%)] md:flex md:h-dvh md:items-center md:justify-center md:p-12">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="relative space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-200">
                <ShieldCheck className="size-3.5" />
                Share your story
              </div>
              <div className="space-y-4">
                <h2 className="max-w-md text-4xl font-semibold tracking-tight text-white">
                  Tell the truth without exposing yourself.
                </h2>
                <p className="max-w-md text-base text-slate-200/80">
                  Your story helps other workers spot red flags before they accept an offer.
                </p>
              </div>
              <div className="relative flex h-52 items-center justify-center">
                <motion.div
                  className="relative flex size-28 items-center justify-center rounded-2xl border border-white/20 bg-white/5 text-emerald-300 shadow-xl backdrop-blur"
                  animate={{ y: [0, -9, 0], rotate: [0, 1.5, 0] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ShieldCheck className="size-12" />
                </motion.div>
                <motion.div
                  className="absolute right-8 top-8 h-3 w-3 rounded-sm bg-amber-300/80"
                  animate={{ y: [0, 15, 0], rotate: [0, 45, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute bottom-8 left-8 h-2 w-10 rounded-full bg-emerald-300/60"
                  animate={{ x: [0, 10, 0], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            </motion.div>
          </div>

          <div className="flex h-full min-h-0 flex-col overflow-hidden p-0 md:items-center md:p-8">
            <div className="flex min-h-0 w-full flex-1 flex-col">
              <header className="z-20 shrink-0 border-b border-border bg-background/95 px-4 pb-4 pt-3 backdrop-blur-xl md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0 md:backdrop-blur-none">
                {account?.accountType === "official" &&
                account.username === "candid" &&
                !isEditing ? (
                  <Button asChild variant="outline" size="sm" className="mb-4">
                    <Link to="/post" search={{ mode: "announcement" }}>
                      <PenLine className="size-4" /> Create Candid update
                    </Link>
                  </Button>
                ) : null}
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                  {isEditing ? "Edit your story" : "Share your exit story"}
                </h1>
                <div
                  className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary"
                  role="progressbar"
                  aria-label="Story completion"
                  aria-valuemin={1}
                  aria-valuemax={steps.length}
                  aria-valuenow={step + 1}
                  aria-valuetext={`Step ${step + 1} of ${steps.length}: ${steps[step]}`}
                >
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={false}
                    animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 180, damping: 26 }
                    }
                  />
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={step}
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                      transition={{ duration: reduceMotion ? 0 : 0.18 }}
                      aria-live="polite"
                    >
                      <p className="text-sm font-semibold">{STEP_DETAILS[step]?.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {STEP_DETAILS[step]?.detail}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {String(step + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
                  </span>
                </div>
              </header>

              <div className="grid min-h-0 flex-1 gap-6 px-4 md:px-0 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="flex min-h-0 flex-col bg-transparent p-0 md:p-0">
                  <div
                    role="region"
                    tabIndex={0}
                    aria-label="Story answers"
                    ref={stepAnswersRef}
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 md:py-5"
                  >
                    <AnimatePresence initial={false} mode="wait" custom={stepDirection}>
                      <motion.div
                        key={step}
                        custom={stepDirection}
                        initial={reduceMotion ? false : { opacity: 0, x: stepDirection * 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0, x: stepDirection * -12 }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 280, damping: 28, mass: 0.7 }
                        }
                        className="space-y-5"
                      >
                        {step === 0 ? (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="company">Who was your employer?</Label>
                              <div className="relative z-30">
                                <Input
                                  id="company"
                                  value={companyName}
                                  role="combobox"
                                  aria-autocomplete="list"
                                  aria-expanded={
                                    employerSuggestionsOpen &&
                                    (companySuggestions.length > 0 || Boolean(companyName.trim()))
                                  }
                                  aria-controls="employer-suggestions"
                                  onFocus={() => setEmployerSuggestionsOpen(true)}
                                  onBlur={(event) => {
                                    const nextTarget = event.relatedTarget;
                                    if (
                                      !(nextTarget instanceof Node) ||
                                      !event.currentTarget.parentElement?.contains(nextTarget)
                                    ) {
                                      setEmployerSuggestionsOpen(false);
                                    }
                                  }}
                                  onChange={(event) => {
                                    setCompanyName(event.target.value);
                                    setIndustry("");
                                    setEmployerSuggestionsOpen(true);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") setEmployerSuggestionsOpen(false);
                                  }}
                                  placeholder="e.g. Sky Minimart, Naivas, a boda stage"
                                  autoComplete="off"
                                />
                                {employerSuggestionsOpen &&
                                (companySuggestions.length > 0 || companyName.trim()) ? (
                                  <div
                                    id="employer-suggestions"
                                    role="listbox"
                                    aria-label="Employer suggestions"
                                    className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-50 max-h-64 overflow-y-auto rounded-2xl border border-border bg-background p-1.5 shadow-xl"
                                  >
                                    {companySuggestions.map((match) => (
                                      <button
                                        key={`${match.name}-${match.industry}`}
                                        type="button"
                                        role="option"
                                        aria-selected={companyName === match.name}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => {
                                          setCompanyName(match.name);
                                          if (match.industry) setIndustry(match.industry);
                                          setEmployerSuggestionsOpen(false);
                                        }}
                                        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-secondary focus-visible:bg-secondary"
                                      >
                                        <Building2 className="size-4 shrink-0 text-primary" />
                                        <span className="min-w-0 flex-1 truncate">
                                          {match.name}
                                        </span>
                                        <span className="max-w-[45%] shrink-0 truncate text-[10px] text-muted-foreground">
                                          {match.industry || "Known employer"}
                                        </span>
                                        {match.verified ? <CompanyVerifiedBadge /> : null}
                                      </button>
                                    ))}
                                    {companyName.trim() ? (
                                      <button
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => setEmployerSuggestionsOpen(false)}
                                        className="mt-1 w-full border-t border-border px-3 py-2.5 text-left text-xs text-muted-foreground hover:bg-secondary"
                                      >
                                        {companySuggestions.length
                                          ? `Continue with “${companyName.trim()}” as entered`
                                          : `Use “${companyName.trim()}” as a new employer`}
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              <p className="rounded-xl border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
                                The company name always appears on a published story. Your Candid
                                username appears as the author; your account email and legal name
                                are not shown. Avoid details that could identify you personally.
                              </p>
                            </div>
                            <ChipField
                              label="What kind of work do they do? (industry)"
                              options={filters.industries}
                              value={industry}
                              onChange={setIndustry}
                            />
                            <div className="space-y-2">
                              <Label>County</Label>
                              <div className="flex flex-wrap gap-2">
                                {visibleCounties.map((option) => (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() => {
                                      setCounty(option);
                                      setArea("");
                                      setShowAllAreas(false);
                                    }}
                                    className={cn(
                                      "rounded-full border px-3 py-1.5 text-sm transition-all duration-200 active:scale-[0.97]",
                                      county === option
                                        ? "border-primary bg-primary/10 text-foreground"
                                        : "border-border text-muted-foreground hover:text-foreground",
                                    )}
                                  >
                                    {option}
                                  </button>
                                ))}
                                {!showAllCounties ? (
                                  <button
                                    type="button"
                                    onClick={() => setShowAllCounties(true)}
                                    className="rounded-full px-3 py-1.5 text-sm font-medium text-primary"
                                  >
                                    +{Math.max(0, countyOptions.length - popularCounties.length)}{" "}
                                    more
                                  </button>
                                ) : null}
                              </div>
                              <Input
                                aria-label="Or enter a county"
                                value={county}
                                onChange={(event) => {
                                  setCounty(event.target.value);
                                  setArea("");
                                }}
                                placeholder="Or type a county"
                                maxLength={80}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="work-area">
                                Which area did you work in? (optional)
                              </Label>
                              {county && areaSuggestions.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {(showAllAreas
                                    ? areaSuggestions
                                    : areaSuggestions.slice(0, 6)
                                  ).map((suggestion) => (
                                    <button
                                      key={suggestion}
                                      type="button"
                                      onClick={() => setArea(suggestion)}
                                      className={cn(
                                        "rounded-full border px-3 py-1.5 text-sm transition-all duration-200 active:scale-[0.97]",
                                        area === suggestion
                                          ? "border-primary bg-primary/10 text-foreground"
                                          : "border-border text-muted-foreground hover:text-foreground",
                                      )}
                                    >
                                      {suggestion}
                                    </button>
                                  ))}
                                  {areaSuggestions.length > 6 && !showAllAreas ? (
                                    <button
                                      type="button"
                                      onClick={() => setShowAllAreas(true)}
                                      className="rounded-full px-3 py-1.5 text-sm font-medium text-primary"
                                    >
                                      See all areas
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                              <Input
                                id="work-area"
                                value={area}
                                onChange={(event) => setArea(event.target.value)}
                                list="candid-work-areas"
                                maxLength={100}
                                placeholder="Choose a suggestion or type an area"
                              />
                              <datalist id="candid-work-areas">
                                {(areaSuggestions ?? []).map((suggestion) => (
                                  <option key={suggestion} value={suggestion} />
                                ))}
                              </datalist>
                              <p className="text-xs text-muted-foreground">
                                Choose an area under the county, type another, or leave it blank.
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="company-map">
                                Public workplace map pin (optional)
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  id="company-map"
                                  value={companyMapUrl}
                                  onChange={(event) => setCompanyMapUrl(event.target.value)}
                                  maxLength={500}
                                  placeholder="Paste a Google Maps link"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={pinningLocation}
                                  onClick={pinCurrentLocation}
                                  className="shrink-0"
                                >
                                  {pinningLocation ? (
                                    <LoaderCircle className="size-4 animate-spin" />
                                  ) : (
                                    <MapPin className="size-4" />
                                  )}
                                  <span className="hidden sm:inline">Use location</span>
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                If you add a pin, its exact location is shown on the published story
                                map. County and area are shown separately either way.
                              </p>
                            </div>
                          </>
                        ) : null}

                        {step === 1 ? (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Why did you leave? Pick all that apply</Label>
                              <div className="flex flex-wrap gap-1.5">
                                {REASONS.map((reason) => (
                                  <button
                                    key={reason}
                                    type="button"
                                    onClick={() =>
                                      setReasons((current) =>
                                        current.includes(reason)
                                          ? current.filter((item) => item !== reason)
                                          : [...current, reason],
                                      )
                                    }
                                    className={cn(
                                      "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-all duration-200 active:scale-[0.97]",
                                      reasons.includes(reason) &&
                                        "border-primary/50 bg-primary/10 text-foreground",
                                    )}
                                  >
                                    {reason}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="custom-reason">Or type your own</Label>
                              <Input
                                id="custom-reason"
                                value={customReason}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (value.endsWith(",")) {
                                    addCustomReason(value);
                                  } else {
                                    setCustomReason(value);
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    addCustomReason(customReason);
                                  }
                                }}
                                placeholder="Type a reason, then press Enter or comma"
                              />
                              <p className="text-xs text-muted-foreground">
                                Each comma or Enter saves it as its own reason.
                              </p>
                              {reasons.filter((r) => !(REASONS as readonly string[]).includes(r))
                                .length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {reasons
                                    .filter((r) => !(REASONS as readonly string[]).includes(r))
                                    .map((reason) => (
                                      <span
                                        key={reason}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1.5 text-sm"
                                      >
                                        {reason}
                                        <button
                                          type="button"
                                          aria-label={`Remove ${reason}`}
                                          onClick={() =>
                                            setReasons((current) =>
                                              current.filter((item) => item !== reason),
                                            )
                                          }
                                        >
                                          <X className="size-3.5" />
                                        </button>
                                      </span>
                                    ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        {step === 2 ? (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="position">What was your job title there?</Label>
                              <Input
                                id="position"
                                value={position}
                                onChange={(event) => setPosition(event.target.value)}
                                placeholder="e.g. Cashier, Graphic Designer, Accountant, Rider"
                              />
                              <p className="text-xs text-muted-foreground">
                                Different positions are paid and treated differently — this keeps
                                your story (and salary data) accurate.
                              </p>
                            </div>
                            <ChipField
                              label="How long did you work there?"
                              options={TENURES}
                              value={tenure}
                              onChange={setTenure}
                            />
                            <ChipField
                              label="How senior were you?"
                              options={LEVELS}
                              value={roleLevel}
                              onChange={setRoleLevel}
                            />
                            <div className="space-y-2">
                              <Label>Would you work here again?</Label>
                              <div className="flex gap-2">
                                {[
                                  { label: "Yes", value: true },
                                  { label: "No", value: false },
                                ].map((option) => (
                                  <button
                                    key={option.label}
                                    type="button"
                                    onClick={() => setWouldReturn(option.value)}
                                    className={cn(
                                      "rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition-all duration-200 active:scale-[0.97]",
                                      wouldReturn === option.value &&
                                        "border-primary/50 bg-primary/10 text-foreground",
                                    )}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : null}

                        {step === 3 ? (
                          <>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <Label htmlFor="title">Headline</Label>
                                <span className="text-[11px] text-muted-foreground">
                                  Optional AI assist
                                </span>
                              </div>
                              <div className="relative">
                                <Input
                                  id="title"
                                  value={title}
                                  maxLength={160}
                                  aria-describedby={aiDescriptionId}
                                  onChange={(event) => setTitle(event.target.value)}
                                  placeholder="Write a short, clear headline"
                                  className="h-12 rounded-2xl border-border/80 bg-card/70 pr-32 text-base shadow-sm focus-visible:ring-primary/40"
                                />
                                <StoryFieldAIControls
                                  field="headline"
                                  value={title}
                                  generating={aiGeneratingField === "title"}
                                  disabled={Boolean(aiGeneratingField)}
                                  onGenerate={() => void generateAiStoryField("title")}
                                  onClear={() => setTitle("")}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <Label htmlFor="body">Your story</Label>
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                  {body.trim().length} / 60 min
                                </span>
                              </div>
                              <div
                                className={cn(
                                  "anon-field relative overflow-hidden rounded-2xl border bg-card/70 shadow-sm transition-colors focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-primary/10",
                                  anonymous ? "border-primary/35" : "border-border/80",
                                )}
                                data-anon={anonymous}
                              >
                                <MentionTextarea
                                  id="body"
                                  rows={10}
                                  value={body}
                                  maxLength={6000}
                                  aria-describedby={aiDescriptionId}
                                  onValueChange={setBody}
                                  placeholder="Share what you experienced and what you want others to know. Keep people’s names and identifying details out."
                                  className="min-h-[15rem] resize-y border-0 bg-transparent px-4 pb-14 pt-14 pr-32 text-base leading-7 shadow-none focus-visible:ring-0"
                                />
                                <StoryFieldAIControls
                                  field="story"
                                  value={body}
                                  generating={aiGeneratingField === "body"}
                                  disabled={Boolean(aiGeneratingField)}
                                  onGenerate={() => void generateAiStoryField("body")}
                                  onClear={() => setBody("")}
                                  align="top"
                                />
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background/70 to-transparent" />
                                {!isEditing ? (
                                  <AnonymousPostingToggle
                                    anonymous={anonymous}
                                    onToggle={() => setAnonymous((value) => !value)}
                                    user={user}
                                    className="absolute bottom-2 right-2 z-10"
                                  />
                                ) : null}
                              </div>
                              <p
                                id={aiDescriptionId}
                                className="text-xs leading-relaxed text-muted-foreground"
                              >
                                AI drafts use details you’ve entered above and may be inaccurate.
                                Review and edit every suggestion. Up to 5 generations daily.
                              </p>
                            </div>
                          </>
                        ) : null}

                        {step === 4 ? (
                          <div className="space-y-4 text-sm">
                            <h2 className="text-lg font-semibold">
                              {isEditing ? "Review your changes" : "Before you publish"}
                            </h2>
                            {isEditing ? (
                              <p className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm text-muted-foreground">
                                Editing the employer is allowed. Any change will send the full story
                                for moderator approval, and it will be hidden until approved.
                                Existing private evidence, if any, will be retained.
                              </p>
                            ) : null}
                            <ul className="space-y-2 text-muted-foreground">
                              <li>
                                · Your Candid handle appears with the story. Your email and legal
                                name are never shown.
                              </li>
                              <li>· Do not name individual colleagues, managers or clients.</li>
                              <li>· Stick to what you experienced or can describe factually.</li>
                              <li>
                                · Automated AI reads each full story. Clear, low-risk stories may go
                                live right away; uncertain or sensitive cases wait for moderator
                                review.
                              </li>
                            </ul>

                            <Button
                              className="w-full glow-primary"
                              disabled={submitting}
                              onClick={submit}
                            >
                              {submitting
                                ? "Screening and publishing…"
                                : isEditing
                                  ? "Submit changes for approval"
                                  : "Publish story"}
                            </Button>
                            {publishError ? (
                              <p
                                role="alert"
                                className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                              >
                                {publishError}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
                    <Button
                      variant="ghost"
                      disabled={step === 0}
                      onClick={() => goToStep(step - 1)}
                    >
                      <ArrowLeft className="size-4" /> Back
                    </Button>
                    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                      {dirty && !submitting ? (
                        <Button
                          variant="outline"
                          disabled={!hasUnsavedDraftChanges}
                          onClick={saveDraft}
                        >
                          <Save className="size-4" />
                          {hasUnsavedDraftChanges ? "Save draft" : "Draft saved"}
                        </Button>
                      ) : null}
                      {dirty && !submitting ? (
                        <Button
                          variant="ghost"
                          className="text-danger"
                          onClick={() => setDiscardOpen(true)}
                        >
                          <Trash2 className="size-4" /> Discard
                        </Button>
                      ) : null}
                      {step < 4 ? (
                        <Button disabled={!canContinue} onClick={() => goToStep(step + 1)}>
                          Continue <ArrowRight className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <ConfirmDialog
                    open={discardOpen}
                    onOpenChange={setDiscardOpen}
                    title="Discard this story?"
                    description="This deletes the saved draft from this device and clears the story form. This cannot be undone."
                    confirmLabel="Discard draft"
                    destructive
                    onConfirm={() => {
                      clearSavedDraft();
                      void navigate({ to: "/" });
                    }}
                  />
                </div>

                <aside className="hidden space-y-4 rounded-3xl border border-danger/30 bg-danger/5 p-5 text-sm xl:block">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4 text-danger" /> Keep yourself safe
                  </h2>
                  <p className="text-muted-foreground">
                    Never include names of individuals, phone numbers, contract numbers, or details
                    only you and one manager would know.
                  </p>
                  <p className="text-muted-foreground">
                    Kenyan defamation law protects individuals. Describe conduct and roles, not
                    people.
                  </p>
                  <Link to="/guidelines" className="inline-block font-medium text-danger">
                    Read the full guidelines →
                  </Link>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoryFieldAIControls({
  field,
  value,
  generating,
  disabled,
  onGenerate,
  onClear,
  align = "center",
}: {
  field: "headline" | "story";
  value: string;
  generating: boolean;
  disabled: boolean;
  onGenerate: () => void;
  onClear: () => void;
  align?: "center" | "top";
}) {
  const hasValue = value.trim().length > 0;
  return (
    <div
      className={cn(
        "absolute right-2 z-10 flex items-center gap-1 rounded-full border border-border/70 bg-background/90 p-1 shadow-sm backdrop-blur-md",
        align === "top" ? "top-2" : "top-1/2 -translate-y-1/2",
      )}
    >
      <button
        type="button"
        aria-label={`Draft ${field} with AI`}
        title={`Draft ${field} with AI`}
        disabled={disabled}
        onClick={onGenerate}
        className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary outline-none transition duration-200 hover:-translate-y-0.5 hover:bg-primary/20 active:scale-90 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-wait disabled:opacity-60"
      >
        {generating ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
      </button>
      <button
        type="button"
        aria-label={`Regenerate ${field} with AI`}
        title={`Regenerate ${field}`}
        disabled={disabled || !hasValue}
        onClick={onGenerate}
        className="grid size-8 place-items-center rounded-full text-muted-foreground outline-none transition duration-200 hover:-translate-y-0.5 hover:bg-secondary hover:text-foreground active:scale-90 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-35"
      >
        <RefreshCw className={cn("size-3.5", generating && "animate-spin")} />
      </button>
      <button
        type="button"
        aria-label={`Clear ${field}`}
        title={`Clear ${field}`}
        disabled={disabled || !hasValue}
        onClick={onClear}
        className="grid size-8 place-items-center rounded-full text-muted-foreground outline-none transition duration-200 hover:-translate-y-0.5 hover:bg-destructive/10 hover:text-destructive active:scale-90 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-35"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function ChipField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(value === option ? "" : option)}
            className={cn(
              "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-all duration-200 active:scale-[0.97]",
              value === option && "border-primary/50 bg-primary/10 text-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Or type it yourself`}
      />
    </div>
  );
}
