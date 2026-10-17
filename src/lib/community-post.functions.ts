import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireVerifiedFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import { generateId, type ProfileRecord, type StoryRecord } from "@/lib/firebase-data.server";
import { getFirestoreDb } from "@/lib/firebase.server";
import { getCandidAccountId } from "@/lib/messaging.server";
import {
  getCloudinaryEvidenceConfig,
  signCloudinaryParams,
  verifyCloudinaryUploadResponse,
} from "@/lib/cloudinary-evidence.server";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

const uploadReceipt = z.object({
  ticket_id: z.string().uuid(),
  public_id: z.string().min(1).max(220),
  version: z.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{40,64}$/i),
  resource_type: z.enum(["image", "video"]),
  format: z.string().min(1).max(12),
  bytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

async function assertCandidAccount(userId: string) {
  if (userId !== (await getCandidAccountId())) {
    throw new Error("Only the Candid account can publish community updates.");
  }
}

export const issueCommunityPostUpload = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        size: z.number().int().positive().max(MAX_VIDEO_BYTES),
        mimeType: z.enum(MEDIA_MIME_TYPES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCandidAccount(context.userId);
    const resourceType = data.mimeType.startsWith("video/") ? "video" : "image";
    const maxBytes = resourceType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (data.size > maxBytes) {
      throw new Error(
        resourceType === "video" ? "Videos must be under 50 MB." : "Images must be under 15 MB.",
      );
    }

    const db = context.db ?? getFirestoreDb();
    const config = getCloudinaryEvidenceConfig();
    const ticketId = generateId();
    const publicId = `candid-community/${ticketId}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = { overwrite: "false", public_id: publicId, timestamp: String(timestamp) };
    const signature = await signCloudinaryParams(signedParams, config.apiSecret);
    await db
      .collection("community_post_uploads")
      .doc(ticketId)
      .set({
        id: ticketId,
        user_id: context.userId,
        cloudinary_public_id: publicId,
        resource_type: resourceType,
        expected_bytes: data.size,
        status: "issued",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    return {
      ticketId,
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      publicId,
      resourceType,
      timestamp,
      signature,
    };
  });

export const createCommunityPost = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        body: z.string().trim().max(5000).default(""),
        media: z.array(uploadReceipt).max(6).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCandidAccount(context.userId);
    const body = data.body.trim();
    if (!body && data.media.length === 0)
      throw new Error("Write an update or add a photo or video.");

    const db = context.db ?? getFirestoreDb();
    const profileSnap = await db.collection("profiles").doc(context.userId).get();
    const profile = profileSnap.data() as ProfileRecord | undefined;
    const config = getCloudinaryEvidenceConfig();
    const preparedMedia = await Promise.all(
      data.media.map(async (receipt) => {
        const ticketRef = db.collection("community_post_uploads").doc(receipt.ticket_id);
        const ticketSnap = await ticketRef.get();
        const ticket = ticketSnap.data() as Record<string, unknown> | undefined;
        const expectedBytes = Number(ticket?.["expected_bytes"] ?? 0);
        const validTicket =
          ticketSnap.exists &&
          ticket?.["user_id"] === context.userId &&
          ticket?.["status"] === "issued" &&
          String(ticket?.["expires_at"] ?? "") > new Date().toISOString() &&
          ticket?.["cloudinary_public_id"] === receipt.public_id &&
          ticket?.["resource_type"] === receipt.resource_type &&
          expectedBytes === receipt.bytes &&
          receipt.bytes <= (receipt.resource_type === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);
        if (!validTicket)
          throw new Error("A media upload expired or could not be verified. Upload it again.");
        const validSignature = await verifyCloudinaryUploadResponse({
          publicId: receipt.public_id,
          version: receipt.version,
          signature: receipt.signature,
          apiSecret: config.apiSecret,
        });
        if (!validSignature)
          throw new Error("Cloudinary could not verify one of the uploaded files.");
        return {
          ticketRef,
          ticketUpdateTime: ticketSnap.updateTime,
          media: {
            url: `https://res.cloudinary.com/${config.cloudName}/${receipt.resource_type}/upload/v${receipt.version}/${receipt.public_id}.${receipt.format}`,
            resource_type: receipt.resource_type,
            format: receipt.format,
            width: receipt.width ?? null,
            height: receipt.height ?? null,
          } as const,
        };
      }),
    );

    const storyId = generateId();
    const createdAt = new Date().toISOString();
    const post: StoryRecord = {
      id: storyId,
      post_type: "announcement",
      media: preparedMedia.map((item) => item.media),
      company_id: "",
      company_name: "Candid",
      company_slug: null,
      company_public: false,
      title: body ? body.slice(0, 120) : "Candid update",
      body,
      reasons: [],
      role_level: null,
      position: null,
      county: null,
      area: null,
      company_location_suggestion: null,
      tenure: null,
      industry: null,
      would_work_again: null,
      author_id: context.userId,
      author_username: profile?.username ?? "candid",
      author_photo_url: profile?.photo_url ?? null,
      status: "published",
      moderation_note: null,
      evidence_status: null,
      upvotes: 0,
      likes: 0,
      follower_count: 0,
      metoo: 0,
      comment_count: 0,
      comment_count_scope: "top_level_v1",
      created_at: createdAt,
    };
    const batch = db.batch();
    batch.create(db.collection("stories").doc(storyId), post);
    for (const item of preparedMedia) {
      batch.update(
        item.ticketRef,
        { status: "attached", post_id: storyId, attached_at: createdAt },
        item.ticketUpdateTime ? { updateTime: item.ticketUpdateTime } : undefined,
      );
    }
    await batch.commit();
    return { id: storyId };
  });
