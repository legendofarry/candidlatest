import { generateText, Output, NoObjectGeneratedError } from "ai";
import { v2 as cloudinary } from "cloudinary";
import { z } from "zod";
import { AI_MODEL, createOpenRouterProvider } from "./ai-gateway.server";
import { getCloudinaryEvidenceConfig } from "./cloudinary-evidence.server";

const ScreenSchema = z.object({
  verdict: z.enum(["approve", "hold", "reject"]),
  confidence: z.number().min(0).max(1),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  risk_flags: z.array(z.string().max(80)).max(8),
  summary: z.string().max(500),
  concerns: z
    .array(z.object({ excerpt: z.string().max(240), reason: z.string().max(240) }))
    .max(8),
  evidence_assessment: z.enum([
    "not_provided",
    "consistent",
    "unclear",
    "mismatch",
    "sensitive_information",
    "unavailable",
  ]),
  evidence_summary: z.string().max(500),
});

const AccountReviewSchema = z.object({
  recommendation: z.enum(["approve", "review", "decline"]),
  confidence: z.number().min(0).max(1),
  risk_level: z.enum(["low", "medium", "high"]),
  flags: z.array(z.string().max(100)).max(8),
  summary: z.string().max(500),
});

export type AccountReview = z.infer<typeof AccountReviewSchema> & {
  model: string;
  decision: "auto_approved" | "important_review";
};

/** Reviews a member's explicit request for an official company badge. */
export async function reviewAccountVerification(input: {
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  accountType: string;
  companyName: string | null;
  companyVerified: boolean;
}) : Promise<AccountReview> {
  const key = process.env["OPENROUTER_API_KEY"];
  const fallback = (summary: string): AccountReview => ({
    recommendation: "review", confidence: 0, risk_level: "medium",
    flags: ["AI screening unavailable"], summary, model: AI_MODEL,
    decision: "important_review",
  });
  if (!key) return fallback("AI screening is not configured; owner review is required.");

  try {
    const gateway = createOpenRouterProvider(key);
    const { output } = await generateText({
      model: gateway(AI_MODEL),
      output: Output.object({ schema: AccountReviewSchema }),
      system: "You review requests for an official company identity badge on Candid. Decide whether the account signals are internally consistent; you cannot establish a person's identity or employment from an email domain. Never infer truth from a username. Recommend approve only if the email is verified, its domain matches a company already verified by Candid, and the record is consistent. Any missing or uncertain signal means review. Decline only clear impersonation or abuse evidence; otherwise request owner review. Explain briefly and identify concrete flags.",
      prompt: `Verified email: ${input.emailVerified ? "yes" : "no"}\nEmail address: ${input.email || "unavailable"}\nAccount type: ${input.accountType}\nUsername: ${input.username || "not set"}\nMatched company: ${input.companyName || "none"}\nCompany already verified by Candid: ${input.companyVerified ? "yes" : "no"}`,
    });
    const canAutoApprove = output.recommendation === "approve"
      && output.confidence >= 0.97
      && output.risk_level === "low"
      && input.emailVerified && input.companyVerified && Boolean(input.companyName);
    return { ...output, model: AI_MODEL, decision: canAutoApprove ? "auto_approved" : "important_review" };
  } catch (error) {
    console.error("[reviewAccountVerification]", error);
    return fallback("AI screening was inconclusive; owner review is required.");
  }
}

export type StoryScreen = z.infer<typeof ScreenSchema> & {
  model: string;
  decision: "auto_approved" | "important_review";
};

async function fetchEvidenceForReview(input: {
  publicId: string;
  format: string;
  bytes: number;
}) {
  const config = getCloudinaryEvidenceConfig();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
  const downloadUrl = cloudinary.utils.private_download_url(
    input.publicId,
    input.format,
    {
      resource_type: "image",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 120,
      attachment: false,
    },
  );
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Cloudinary proof download failed (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024 || bytes.byteLength !== input.bytes) {
    throw new Error("The proof file is empty or exceeds the supported size.");
  }
  const format = input.format.toLowerCase();
  const mediaType = format === "jpg" || format === "jpeg"
    ? "image/jpeg"
    : format === "png"
      ? "image/png"
      : format === "webp"
        ? "image/webp"
        : format === "pdf"
          ? "application/pdf"
          : null;
  if (!mediaType) throw new Error("This proof format cannot be analyzed.");
  return { bytes, mediaType };
}

function fallbackScreen(reason: string, evidenceProvided: boolean): StoryScreen {
  return {
    verdict: "hold",
    confidence: 0,
    risk_level: "high",
    risk_flags: ["AI screening unavailable"],
    summary: reason,
    concerns: [],
    evidence_assessment: evidenceProvided ? "unavailable" : "not_provided",
    evidence_summary: evidenceProvided ? "Proof could not be analyzed." : "No proof attached.",
    model: AI_MODEL,
    decision: "important_review",
  };
}

/** Screens the complete story and any attached private proof before deciding whether it can publish. */
export async function screenStory(input: {
  title: string;
  body: string;
  evidence?: { publicId: string; format: string; bytes: number } | null;
  evidenceNote?: string | null;
}): Promise<StoryScreen> {
  const key = process.env["OPENROUTER_API_KEY"];
  if (!key) return fallbackScreen("AI screening is not configured.", Boolean(input.evidence));

  const gateway = createOpenRouterProvider(key);
  try {
    const evidenceFile = input.evidence
      ? await fetchEvidenceForReview(input.evidence)
      : null;
    const content = [
      {
        type: "text" as const,
        text: `Review the complete submission, not a sample.\n\nTitle: ${input.title}\n\nFull story: ${input.body}\n\nPrivate evidence note: ${input.evidenceNote?.trim() || "None"}\n\nEvidence file: ${input.evidence ? "A proof document/image is attached. Analyze only whether it appears relevant, contains exposed personal/sensitive information, or is too unclear to assess. It does not prove the story is true." : "No file attached."}`,
      },
      ...(evidenceFile
        ? [{
            type: "file" as const,
            data: evidenceFile.bytes,
            mediaType: evidenceFile.mediaType,
            filename: evidenceFile.mediaType === "application/pdf" ? "proof.pdf" : `proof.${input.evidence!.format}`,
          }]
        : []),
    ];
    const { output } = await generateText({
      model: gateway(AI_MODEL),
      output: Output.object({ schema: ScreenSchema }),
      system:
        "You are a cautious moderator for Kenyan workplace exit stories. Read every word of the complete story and inspect the attached image/PDF if present. Ordinary first-person workplace criticism is allowed. Do not treat an employer name as an individual. Set approve only when there is no clear policy violation, no exposed personal identifying or financial information, no credible threat, and no obvious unsupported serious accusation against a named individual. Set hold for uncertainty, named private individuals, serious allegations, identifying details, unclear or mismatched proof, or any personal data in proof. Set reject only for unmistakable doxxing, direct threats, slurs, or clear targeted abuse. Never decide whether a claim is true. Proof can be relevant but cannot establish truth or employment by itself. Include short exact excerpts for material concerns. confidence must reflect certainty; any uncertainty lowers it. Evidence assessment should only describe visible relevance/readability and sensitive-data exposure, not authenticate the document.",
      messages: [{ role: "user", content }],
    });
    const autoApproved = output.verdict === "approve"
      && output.confidence >= 0.92
      && output.risk_level === "low"
      && !output.risk_flags.length
      && (!input.evidence || output.evidence_assessment === "consistent")
      && output.evidence_assessment !== "unclear"
      && output.evidence_assessment !== "mismatch"
      && output.evidence_assessment !== "sensitive_information"
      && output.evidence_assessment !== "unavailable";
    return {
      ...output,
      model: AI_MODEL,
      decision: autoApproved ? "auto_approved" : "important_review",
    };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return fallbackScreen("AI screening was inconclusive.", Boolean(input.evidence));
    }
    console.error("[screenStory]", error);
    return fallbackScreen("AI screening failed; owner review is required.", Boolean(input.evidence));
  }
}

const ProfileSchema = z.object({
  summary: z.string(),
  descriptor: z.string(),
  industry: z.string().nullable(),
  headquarters: z.string().nullable(),
  size_band: z.string().nullable(),
  founded_year: z.number().nullable(),
  typical_roles: z.array(z.string()),
  reputation_notes: z.string(),
  employment_context: z.string(),
});

/** AI research for a company profile. Never invents accusations. */
export async function researchCompany(input: {
  name: string;
  industry?: string | null;
  county?: string | null;
}) {
  const key = process.env["OPENROUTER_API_KEY"];
  if (!key) return null;

  const gateway = createOpenRouterProvider(key);
  try {
    const { output } = await generateText({
      model: gateway(AI_MODEL),
      output: Output.object({ schema: ProfileSchema }),
      system:
        "You research employers operating in Kenya for a neutral company directory. Only state what is publicly known and general. Never invent scandals, accusations, or named individuals. If unsure of a fact, use null or say it is not publicly documented. descriptor is one line under 90 characters. employment_context describes general Kenyan labour-law context for this sector (contracts, NSSF, SHIF, PAYE, overtime norms), not claims about this employer.",
      prompt: `Company: ${input.name}\nIndustry hint: ${input.industry ?? "unknown"}\nCounty hint: ${input.county ?? "unknown"}`,
    });
    return { ...output, model: AI_MODEL };
  } catch (error) {
    console.error("[researchCompany]", error);
    return null;
  }
}

/** Short catch-up on what changed in a story thread since the reader last looked. */
export async function summarizeStoryActivity(input: {
  title: string;
  body: string;
  comments: string[];
}) {
  if (input.comments.length === 0) return "Nothing new since you last checked in on this story.";

  const key = process.env["OPENROUTER_API_KEY"];
  if (!key) {
    return `${input.comments.length} new ${input.comments.length === 1 ? "comment" : "comments"} since you last checked in.`;
  }

  const gateway = createOpenRouterProvider(key);
  try {
    const { text } = await generateText({
      model: gateway(AI_MODEL),
      system:
        "You summarise new activity on a Kenyan workplace story thread for someone who already read the story. Write 2-3 short sentences starting from what has changed since they last looked. Neutral, factual, no names of individuals, no advice, under 60 words.",
      prompt: `Story title: ${input.title}\n\nStory: ${input.body.slice(0, 1200)}\n\nNew comments since the reader last looked:\n${input.comments
        .map((comment, index) => `${index + 1}. ${comment}`)
        .join("\n")}`,
    });
    return text.trim();
  } catch (error) {
    console.error("[summarizeStoryActivity]", error);
    return `${input.comments.length} new ${input.comments.length === 1 ? "comment" : "comments"} since you last checked in.`;
  }
}
