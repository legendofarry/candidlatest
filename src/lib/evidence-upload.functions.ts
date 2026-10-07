import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireFirebaseAuth,
  requireVerifiedFirebaseAuth,
} from "@/integrations/firebase/auth-middleware";
import { getCloudinaryEvidenceConfig, signCloudinaryParams } from "./cloudinary-evidence.server";
import { generateId } from "./firebase-data.server";
import { getFirestoreDb } from "./firebase.server";

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export const issueEmploymentEvidenceUpload = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        size: z.number().int().positive().max(MAX_EVIDENCE_BYTES),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const config = getCloudinaryEvidenceConfig();
    const ticketId = generateId();
    const storyId = generateId();
    const publicId = `candid-employment-evidence/${storyId}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = {
      overwrite: "false",
      public_id: publicId,
      timestamp: String(timestamp),
      type: "authenticated",
    };
    const signature = await signCloudinaryParams(signedParams, config.apiSecret);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await db
      .collection("employment_evidence_uploads")
      .doc(ticketId)
      .set({
        id: ticketId,
        user_id: context.userId,
        story_id: storyId,
        cloudinary_public_id: publicId,
        expected_format: data.mimeType === "image/jpeg" ? "jpg" : data.mimeType.split("/")[1],
        expected_bytes: data.size,
        status: "issued",
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
      });

    return {
      ticketId,
      storyId,
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      publicId,
      timestamp,
      type: "authenticated" as const,
      overwrite: false as const,
      signature,
    };
  });

export const discardEmploymentEvidenceUpload = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ ticketId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.db ?? getFirestoreDb();
    const ticketRef = db.collection("employment_evidence_uploads").doc(data.ticketId);
    const snapshot = await ticketRef.get();
    const ticket = snapshot.data();
    if (!snapshot.exists || ticket?.user_id !== context.userId) {
      throw new Error("Proof upload not found.");
    }
    if (ticket.status === "discarded") return { ok: true as const };
    if (ticket.status !== "issued") {
      throw new Error("This proof is already attached to a submitted story.");
    }

    const config = getCloudinaryEvidenceConfig();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const params = {
      invalidate: "true",
      public_id: String(ticket.cloudinary_public_id),
      timestamp,
      type: "authenticated",
    };
    const signature = await signCloudinaryParams(params, config.apiSecret);
    const form = new FormData();
    form.set("api_key", config.apiKey);
    form.set("public_id", params.public_id);
    form.set("timestamp", timestamp);
    form.set("type", params.type);
    form.set("invalidate", params.invalidate);
    form.set("signature", signature);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`,
      { method: "POST", body: form },
    );
    const result = (await response.json().catch(() => ({}))) as {
      result?: string;
      error?: { message?: string };
    };
    if (!response.ok || !["ok", "not found"].includes(result.result ?? "")) {
      throw new Error(
        result.error?.message || "The proof file could not be removed. Please retry.",
      );
    }

    await ticketRef.update({ status: "discarded", discarded_at: new Date().toISOString() });
    return { ok: true as const };
  });
