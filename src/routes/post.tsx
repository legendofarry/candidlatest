import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  FileText,
  Image as ImageIcon,
  Lock,
  LoaderCircle,
  Paperclip,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { inbox, notify as toast } from "@/lib/notifications-store";
import { getFilterOptions } from "@/lib/public.functions";
import { createStory, ensureProfile, findOrCreateCompany } from "@/lib/actions.functions";
import { buildStoryDraft } from "@/lib/story-draft";
import {
  discardEmploymentEvidenceUpload,
  issueEmploymentEvidenceUpload,
} from "@/lib/evidence-upload.functions";
import { findCompanyMatches } from "@/lib/company-match";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/site/confirm-dialog";
import { FloatingBackButton } from "@/components/site/floating-back-button";
import { cn } from "@/lib/utils";
import { CompanyVerifiedBadge } from "@/components/site/company-verified-badge";

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
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const EVIDENCE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

type EvidenceUploadReceipt = {
  ticket_id: string;
  public_id: string;
  version: number;
  signature: string;
  resource_type: "image";
  type: "authenticated";
  format: string;
  bytes: number;
};

type CloudinaryUploadResult = {
  public_id: string;
  version: number;
  signature: string;
  resource_type: string;
  type: string;
  format: string;
  bytes: number;
  error?: { message?: string };
};

type StoryDraft = {
  version: 1;
  step: number;
  companyName: string;
  industry: string;
  county: string;
  reasons: string[];
  customReason: string;
  tenure: string;
  roleLevel: string;
  position: string;
  title: string;
  body: string;
  wouldReturn: boolean | null;
  evidenceNote: string;
};

export const Route = createFileRoute("/post")({
  loader: ({ context }) => context.queryClient.ensureQueryData(filtersQuery),
  head: () => ({
    meta: [
      { title: "Share your exit story | Candid" },
      {
        name: "description",
        content:
          "Tell Kenyan job seekers why you really left. Four quick steps, screened before publishing.",
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
  const { data: filters } = useSuspenseQuery(filtersQuery);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const ensure = useServerFn(ensureProfile);
  const findCompany = useServerFn(findOrCreateCompany);
  const create = useServerFn(createStory);
  const issueEvidenceUpload = useServerFn(issueEmploymentEvidenceUpload);
  const discardEvidenceUpload = useServerFn(discardEmploymentEvidenceUpload);

  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [county, setCounty] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [customReason, setCustomReason] = useState("");
  const [tenure, setTenure] = useState("");
  const [roleLevel, setRoleLevel] = useState("");
  const [position, setPosition] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [storyDraftedFromAnswers, setStoryDraftedFromAnswers] = useState(false);
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreviewUrl, setEvidencePreviewUrl] = useState<string | null>(null);
  const [evidenceUpload, setEvidenceUpload] = useState<EvidenceUploadReceipt | null>(null);
  const [evidenceTicketId, setEvidenceTicketId] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState("");
  const [publishError, setPublishError] = useState("");
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const uploadLock = useRef(false);
  const uploadAbortController = useRef<AbortController | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [savedDraftKey, setSavedDraftKey] = useState<string | null>(null);
  const [draftReadyForUser, setDraftReadyForUser] = useState<string | null>(null);
  const storageFailureNotified = useRef(false);
  const writingAttemptKey = useRef<string | null>(null);
  const storyDraftUserId = user?.uid;

  const generateFromEarlierAnswers = useCallback(() => {
    const draft = buildStoryDraft({
      company: companyName,
      industry,
      county,
      reasons,
      position,
      tenure,
      roleLevel,
      wouldReturn,
    });
    setTitle(draft.title);
    setBody(draft.body);
    setStoryDraftedFromAnswers(true);
  }, [companyName, county, industry, position, reasons, roleLevel, tenure, wouldReturn]);

  useEffect(() => {
    if (!evidenceFile) {
      setEvidencePreviewUrl(null);
      return;
    }
    const preview = URL.createObjectURL(evidenceFile);
    setEvidencePreviewUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [evidenceFile]);

  const dirty =
    companyName.trim().length > 0 ||
    industry.trim().length > 0 ||
    county.trim().length > 0 ||
    reasons.length > 0 ||
    customReason.trim().length > 0 ||
    tenure.length > 0 ||
    roleLevel.length > 0 ||
    position.trim().length > 0 ||
    title.trim().length > 0 ||
    body.trim().length > 0 ||
    wouldReturn !== null ||
    evidenceNote.trim().length > 0 ||
    Boolean(evidenceFile || evidenceUpload);

  const storyDraft: StoryDraft = {
    version: 1,
    step,
    companyName,
    industry,
    county,
    reasons,
    customReason,
    tenure,
    roleLevel,
    position,
    title,
    body,
    wouldReturn,
    evidenceNote,
  };
  const storyDraftKey = JSON.stringify(storyDraft);
  const hasUnsavedDraftChanges = dirty && savedDraftKey !== storyDraftKey;

  useEffect(() => {
    if (step !== 3 || title.trim() || body.trim()) return;
    const attemptKey = JSON.stringify({
      companyName,
      industry,
      county,
      reasons,
      position,
      tenure,
      roleLevel,
      wouldReturn,
    });
    if (writingAttemptKey.current === attemptKey) return;
    writingAttemptKey.current = attemptKey;
    generateFromEarlierAnswers();
  }, [
    body,
    companyName,
    county,
    generateFromEarlierAnswers,
    industry,
    position,
    reasons,
    roleLevel,
    step,
    tenure,
    title,
    wouldReturn,
  ]);

  useEffect(() => {
    if (!storyDraftUserId) {
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
          reasons: Array.isArray(parsed.reasons)
            ? parsed.reasons.filter((reason): reason is string => typeof reason === "string").slice(0, 10)
            : [],
          customReason: typeof parsed.customReason === "string" ? parsed.customReason : "",
          tenure: typeof parsed.tenure === "string" ? parsed.tenure : "",
          roleLevel: typeof parsed.roleLevel === "string" ? parsed.roleLevel : "",
          position: typeof parsed.position === "string" ? parsed.position : "",
          title: typeof parsed.title === "string" ? parsed.title : "",
          body: typeof parsed.body === "string" ? parsed.body : "",
          wouldReturn: typeof parsed.wouldReturn === "boolean" ? parsed.wouldReturn : null,
          evidenceNote: typeof parsed.evidenceNote === "string" ? parsed.evidenceNote : "",
        };
        setStep(restored.step);
        setCompanyName(restored.companyName);
        setIndustry(restored.industry);
        setCounty(restored.county);
        setReasons(restored.reasons);
        setCustomReason(restored.customReason);
        setTenure(restored.tenure);
        setRoleLevel(restored.roleLevel);
        setPosition(restored.position);
        setTitle(restored.title);
        setBody(restored.body);
        setWouldReturn(restored.wouldReturn);
        setEvidenceNote(restored.evidenceNote);
        setSavedDraftKey(JSON.stringify(restored));
        toast.info("Draft restored", {
          description: "Your saved story draft is ready on this device. Reattach proof if needed.",
        });
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
  }, [storyDraftUserId]);

  useEffect(() => {
    if (!storyDraftUserId || draftReadyForUser !== storyDraftUserId || !dirty) return;
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
  }, [draftReadyForUser, dirty, storyDraftKey, storyDraftUserId]);

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

  const steps = ["Employer", "What happened", "Your role", "Your story", "Review"];

  const matches = findCompanyMatches(companyName, filters.companies, 5);
  const exactMatch = matches.some((m) => m.name.toLowerCase() === companyName.trim().toLowerCase());

  function saveDraft() {
    if (!user || !dirty) return;
    try {
      window.localStorage.setItem(`candid:story-draft:${user.uid}`, storyDraftKey);
      setSavedDraftKey(storyDraftKey);
      toast.success("Draft saved", {
        description: evidenceFile || evidenceUpload
          ? "Saved on this device. Reattach your proof file before publishing."
          : "Saved on this device. Come back anytime to continue.",
      });
    } catch {
      toast.error("Could not save draft", { description: "Check your device storage and try again." });
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

  async function selectEvidenceFile(file: File | undefined) {
    setEvidenceError("");
    if (!file) return;
    if (!EVIDENCE_MIME_TYPES.includes(file.type as (typeof EVIDENCE_MIME_TYPES)[number])) {
      setEvidenceError("Choose a JPG, PNG, WebP, or PDF file.");
      return;
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      setEvidenceError("Proof files must be 5 MB or smaller.");
      return;
    }

    if (evidenceTicketId && evidenceTicketId !== evidenceUpload?.ticket_id) {
      try {
        await discardEvidenceUpload({ data: { ticketId: evidenceTicketId } });
      } catch (error) {
        setEvidenceError(
          error instanceof Error ? error.message : "Could not remove the old upload.",
        );
        return;
      }
    }
    setEvidenceFile(file);
    setEvidenceUpload(null);
    setEvidenceTicketId(null);
  }

  async function removeEvidenceFile() {
    if (uploadingEvidence || submitting) return;
    setEvidenceError("");
    if (evidenceTicketId) {
      try {
        await discardEvidenceUpload({ data: { ticketId: evidenceTicketId } });
      } catch (error) {
        setEvidenceError(
          error instanceof Error ? error.message : "Could not remove the proof file.",
        );
        return;
      }
    }
    setEvidenceFile(null);
    setEvidenceUpload(null);
    setEvidenceTicketId(null);
  }

  async function uploadEvidenceFile(file: File): Promise<EvidenceUploadReceipt> {
    if (uploadLock.current) throw new Error("The proof file is already uploading.");
    uploadLock.current = true;
    setUploadingEvidence(true);
    const controller = new AbortController();
    uploadAbortController.current = controller;

    try {
      if (evidenceTicketId) {
        await discardEvidenceUpload({ data: { ticketId: evidenceTicketId } });
        setEvidenceTicketId(null);
      }
      const ticket = await issueEvidenceUpload({
        data: { size: file.size, mimeType: file.type as (typeof EVIDENCE_MIME_TYPES)[number] },
      });
      setEvidenceTicketId(ticket.ticketId);
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", ticket.apiKey);
      form.append("timestamp", String(ticket.timestamp));
      form.append("public_id", ticket.publicId);
      form.append("type", ticket.type);
      form.append("overwrite", String(ticket.overwrite));
      form.append("signature", ticket.signature);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(ticket.cloudName)}/image/upload`,
        { method: "POST", body: form, signal: controller.signal },
      );
      const result = (await response.json()) as CloudinaryUploadResult;
      if (!response.ok) {
        throw new Error(result.error?.message || "Cloudinary could not upload this file.");
      }
      if (
        result.public_id !== ticket.publicId ||
        result.resource_type !== "image" ||
        result.type !== "authenticated" ||
        !Number.isInteger(result.version) ||
        typeof result.signature !== "string" ||
        typeof result.format !== "string" ||
        result.bytes !== file.size
      ) {
        throw new Error("Cloudinary returned an unexpected proof file. Please retry the upload.");
      }

      const receipt: EvidenceUploadReceipt = {
        ticket_id: ticket.ticketId,
        public_id: result.public_id,
        version: result.version,
        signature: result.signature,
        resource_type: "image",
        type: "authenticated",
        format: result.format,
        bytes: result.bytes,
      };
      setEvidenceUpload(receipt);
      setEvidenceTicketId(ticket.ticketId);
      setEvidenceError("");
      return receipt;
    } finally {
      uploadLock.current = false;
      uploadAbortController.current = null;
      setUploadingEvidence(false);
    }
  }

  async function submit() {
    setPublishError("");
    setEvidenceError("");
    setSubmitting(true);
    try {
      let uploadedProof = evidenceUpload;
      if (evidenceFile && !uploadedProof) uploadedProof = await uploadEvidenceFile(evidenceFile);

      await ensure({ data: { county: county || null } });
      const company = await findCompany({
        data: { name: companyName.trim(), industry: industry || null, county: county || null },
      });

      const evidence =
        evidenceNote.trim() || uploadedProof
          ? { note: evidenceNote.trim() || null, upload: uploadedProof }
          : null;

      const result = await create({
        data: {
          company_id: company.id,
          title: title.trim(),
          body: body.trim(),
          reasons,
          role_level: roleLevel || null,
          position: position.trim() || null,
          county: county || null,
          tenure: tenure || null,
          industry: industry || company.industry || null,
          would_work_again: wouldReturn,
          evidence,
        },
      });

      clearSavedDraft();
      if (result.status === "published") {
        toast.success("Your story is live");
        navigate({ to: "/stories/$id", params: { id: result.id } });
      } else {
        inbox.info("Story submitted for review", {
          description: "It will appear in the feed once a moderator approves it.",
        });
        navigate({ to: "/" });
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.name === "AbortError"
          ? "Proof upload canceled. Your story was not submitted."
          : error.message
        : "Something went wrong while publishing your story.";
      setPublishError(message);
      if (message.includes("Proof uploads are not configured")) setEvidenceError(message);
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
    <div className="min-h-[calc(100dvh-4rem)] w-full bg-background md:h-dvh md:overflow-hidden">
      <div className="relative min-h-[calc(100dvh-4rem)] w-full overflow-hidden border-0 bg-transparent shadow-none md:h-dvh md:min-h-0 md:bg-card/85 md:shadow-2xl md:backdrop-blur-xl">
        <FloatingBackButton
          onClick={() => navigate({ to: "/" })}
          className="hidden md:inline-flex"
        />

        <div className="grid min-h-[calc(100dvh-4rem)] md:h-dvh md:min-h-0 md:grid-cols-[1.05fr_1.2fr]">
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

          <div className="flex items-start p-4 pt-3 md:h-dvh md:items-center md:overflow-y-auto md:p-8">
            <div className="w-full space-y-6">
              <header>
                <h1 className="text-3xl font-semibold md:text-4xl">Share your exit story</h1>
                <div className="mt-4 flex gap-1.5">
                  {steps.map((label, index) => (
                    <div
                      key={label}
                      className={cn(
                        "h-1.5 flex-1 rounded-full bg-secondary transition-colors",
                        index <= step && "bg-primary",
                      )}
                    />
                  ))}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Step {step + 1} of {steps.length} · {steps[step]}
                </p>
              </header>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="space-y-5 rounded-none border-0 bg-transparent p-0 md:rounded-3xl md:border md:border-border md:bg-card md:p-6">
                  {step === 0 ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="company">Who was your employer?</Label>
                        <Input
                          id="company"
                          value={companyName}
                          onChange={(event) => setCompanyName(event.target.value)}
                          placeholder="e.g. Sky Minimart, Naivas, a boda stage"
                          autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                          The shop, company, or person you worked for — whatever name everyone knows
                          it by.
                        </p>

                        {matches.length > 0 && !exactMatch ? (
                          <div className="space-y-1.5 rounded-2xl border border-border bg-secondary/40 p-3">
                            <p className="text-xs font-medium text-muted-foreground">
                              {matches.length === 1
                                ? "Possible existing employer — is this the same business?"
                                : "Possible existing employers — is one of these the same business?"}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {matches.map((match) => (
                                <button
                                  key={match.slug}
                                  type="button"
                                  onClick={() => setCompanyName(match.name)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/50"
                                >
                                  <Building2 className="size-3.5 text-primary" />
                                  {match.name}
                                  {match.verified ? <CompanyVerifiedBadge /> : null}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {companyName.trim().length > 1 && matches.length === 0 ? (
                          <p className="rounded-2xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                            Can't find your employer? No problem — posting adds "
                            <span className="font-medium text-foreground">
                              {companyName.trim()}
                            </span>
                            " to the directory so others can find it too.
                          </p>
                        ) : null}
                      </div>
                      <ChipField
                        label="What kind of work do they do? (industry)"
                        options={filters.industries}
                        value={industry}
                        onChange={setIndustry}
                      />
                      <ChipField
                        label="Which county is this?"
                        options={filters.counties}
                        value={county}
                        onChange={setCounty}
                      />
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
                                "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground",
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
                        {reasons.filter((r) => !(REASONS as readonly string[]).includes(r)).length >
                        0 ? (
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
                          Different positions are paid and treated differently — this keeps your
                          story (and salary data) accurate.
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
                                "rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground",
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
                      <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h2 className="flex items-center gap-2 text-sm font-semibold">
                              <FileText className="size-4 text-primary" /> Smart draft from your answers
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                              This draft uses a local writing helper, so no AI service is called to create it. Add details only you know, then edit it below.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={generateFromEarlierAnswers}
                          >
                            <FileText className="size-4" /> Rebuild from answers
                          </Button>
                        </div>
                        {storyDraftedFromAnswers ? (
                          <p className="mt-3 text-xs text-muted-foreground">
                            Draft created from your answers. Check it for accuracy before continuing.
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="title">Headline</Label>
                        <Input
                          id="title"
                          value={title}
                          onChange={(event) => setTitle(event.target.value)}
                          placeholder="Three months of salary paid late, every time"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="body">Your story</Label>
                        <Textarea
                          id="body"
                          rows={10}
                          value={body}
                          onChange={(event) => setBody(event.target.value)}
                          placeholder="What happened, how it affected you, and what a job seeker should know. Describe roles, not names."
                        />
                        <p className="text-xs text-muted-foreground">
                          {body.trim().length} characters (min 60)
                        </p>
                      </div>
                    </>
                  ) : null}

                  {step === 4 ? (
                    <div className="space-y-4 text-sm">
                      <h2 className="text-lg font-semibold">Before you publish</h2>
                      <ul className="space-y-2 text-muted-foreground">
                        <li>
                          · Your Candid handle appears with the story. Your email and legal name are
                          never shown.
                        </li>
                        <li>· Do not name individual colleagues, managers or clients.</li>
                        <li>· Stick to what you experienced or can describe factually.</li>
                          <li>
                            · Automated AI reads each full story. Clear, low-risk stories may go
                            live right away; uncertain or sensitive cases wait for moderator review.
                          </li>
                      </ul>

                      <div className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-4">
                        <h3 className="flex items-center gap-2 font-semibold">
                          <Lock className="size-4 text-primary" /> Prove you worked there (optional,
                          private)
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Add a document or image that can help moderators review your story. Proof
                          is uploaded to restricted Cloudinary storage, is{" "}
                          <span className="font-medium text-foreground">never published</span>, and
                          is never shown to the employer. If attached, AI checks it for relevance and
                          exposed sensitive details; this does not verify that the story is true.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Paid via M-Pesa from your boss's personal number? That's normal for small
                          businesses — just add a short note below telling us.
                        </p>

                        <Textarea
                          rows={2}
                          value={evidenceNote}
                          onChange={(event) => setEvidenceNote(event.target.value)}
                          placeholder="Optional private note, e.g. “Salary came from the owner's personal M-Pesa.”"
                        />

                        <div className="space-y-3 border-t border-border/70 pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">Attach proof (optional)</p>
                              <p className="text-xs text-muted-foreground">
                                JPG, PNG, WebP, or PDF · up to 5 MB
                              </p>
                            </div>
                            <label
                              className={cn(
                                "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium hover:border-primary/50",
                                uploadingEvidence && "pointer-events-none opacity-60",
                                evidenceUpload && "pointer-events-none opacity-60",
                              )}
                            >
                              <Paperclip className="size-4" />
                              {evidenceFile
                                ? evidenceUpload
                                  ? "Uploaded"
                                  : "Choose another"
                                : "Choose file"}
                              <input
                                type="file"
                                className="sr-only"
                                accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                                disabled={
                                  uploadingEvidence || submitting || Boolean(evidenceUpload)
                                }
                                onChange={(event) => {
                                  void selectEvidenceFile(event.currentTarget.files?.[0]);
                                  event.currentTarget.value = "";
                                }}
                              />
                            </label>
                          </div>

                          {evidenceFile ? (
                            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/70 p-3">
                              {evidenceFile.type.startsWith("image/") && evidencePreviewUrl ? (
                                <img
                                  src={evidencePreviewUrl}
                                  alt="Selected proof preview"
                                  className="size-14 rounded-lg object-cover"
                                />
                              ) : (
                                <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                                  <FileText className="size-6" />
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{evidenceFile.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(evidenceFile.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                              </div>
                              {uploadingEvidence ? (
                                <button
                                  type="button"
                                  className="text-xs text-muted-foreground underline underline-offset-4"
                                  onClick={() => uploadAbortController.current?.abort()}
                                >
                                  Cancel
                                </button>
                              ) : evidenceUpload ? (
                                <button
                                  type="button"
                                  aria-label="Remove proof file"
                                  disabled={submitting}
                                  onClick={() => void removeEvidenceFile()}
                                  className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                                >
                                  <X className="size-4" />
                                </button>
                              ) : evidenceTicketId ? (
                                <button
                                  type="button"
                                  aria-label="Remove proof file"
                                  disabled={submitting}
                                  onClick={() => void removeEvidenceFile()}
                                  className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                                >
                                  <X className="size-4" />
                                </button>
                              ) : (
                                <>
                                  <ImageIcon className="size-5 shrink-0 text-muted-foreground" />
                                  <button
                                    type="button"
                                    aria-label="Remove selected proof file"
                                    disabled={submitting}
                                    onClick={() => void removeEvidenceFile()}
                                    className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                                  >
                                    <X className="size-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          ) : null}

                          {evidenceError ? (
                            <p role="alert" className="text-xs text-danger">
                              {evidenceError}
                            </p>
                          ) : null}
                          {evidenceUpload ? (
                            <p className="text-xs text-primary">
                              Proof uploaded securely. It will be attached when you submit the
                              story.
                            </p>
                          ) : evidenceFile ? (
                            <p className="text-xs text-muted-foreground">
                              It will upload securely when you publish. Remove it above to publish
                              without proof.
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <Button
                        className="w-full glow-primary"
                        disabled={submitting || uploadingEvidence}
                        onClick={submit}
                      >
                        {uploadingEvidence ? (
                          <>
                            <LoaderCircle className="size-4 animate-spin" /> Uploading proof…
                          </>
                        ) : submitting ? (
                          "Screening and publishing…"
                        ) : (
                          "Publish story"
                        )}
                      </Button>
                      {publishError ? (
                        <p role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                          {publishError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <Button
                      variant="ghost"
                      disabled={step === 0}
                      onClick={() => setStep((s) => s - 1)}
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
                        <Button disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
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

                <aside className="space-y-4 rounded-3xl border border-danger/30 bg-danger/5 p-5 text-sm">
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
              "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground",
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
