import {
  createAuthenticatedImageUrl,
  destroyAuthenticatedImage,
  getCloudinaryEvidenceConfig,
  signCloudinaryParams,
  verifyCloudinaryUploadResponse,
} from "./cloudinary-evidence.server";
import { generateId, type ProfileRecord } from "./firebase-data.server";
import { getFirestoreDb } from "./firebase.server";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_SLOTS = new Set(["id_front", "id_back", "selfie", "payslip"]);

type EvidenceSlot = "id_front" | "id_back" | "selfie" | "payslip";
type EvidenceReceipt = {
  ticket_id: string;
  slot: EvidenceSlot;
  public_id: string;
  version: number;
  signature: string;
  format: string;
  bytes: number;
};

function evidenceId(userId: string, slot: EvidenceSlot) {
  return `${userId}__${slot}`;
}

async function assertCandidOfficial(userId: string) {
  const profile = (await getFirestoreDb().collection("profiles").doc(userId).get()).data() as
    | ProfileRecord
    | undefined;
  if (profile?.account_type !== "official") {
    throw new Error("Only the official Candid account can review moderator identity checks.");
  }
}

export async function issueModeratorEvidenceUpload(input: {
  userId: string;
  slot: EvidenceSlot;
  size: number;
  mimeType: string;
}) {
  if (!ALLOWED_SLOTS.has(input.slot)) throw new Error("Choose a valid identity document type.");
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) throw new Error("Upload a JPG, PNG, or WebP image.");
  if (input.size <= 0 || input.size > MAX_IMAGE_BYTES) throw new Error("Each image must be smaller than 8 MB.");
  const db = getFirestoreDb();
  const profileSnap = await db.collection("profiles").doc(input.userId).get();
  const profile = profileSnap.data() as ProfileRecord | undefined;
  if (profile?.account_type === "company") throw new Error("Company accounts cannot apply to moderate worker groups.");
  const verification = await db.collection("moderator_identity_verifications").doc(input.userId).get();
  if (verification.get("status") === "approved") return { alreadyApproved: true as const };
  if (verification.get("status") === "pending_review") {
    throw new Error("Your identity check is already waiting for Candid review.");
  }

  const config = getCloudinaryEvidenceConfig();
  const ticketId = generateId();
  const publicId = `candid-moderator-evidence/${input.userId}/${ticketId}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signedParams = {
    overwrite: "false",
    public_id: publicId,
    timestamp: String(timestamp),
    type: "authenticated",
  };
  const signature = await signCloudinaryParams(signedParams, config.apiSecret);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await db.collection("moderator_identity_uploads").doc(ticketId).set({
    id: ticketId,
    user_id: input.userId,
    slot: input.slot,
    cloudinary_public_id: publicId,
    expected_format: input.mimeType === "image/jpeg" ? "jpg" : input.mimeType.split("/")[1],
    expected_bytes: input.size,
    status: "issued",
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  });
  return {
    alreadyApproved: false as const,
    ticketId,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    publicId,
    timestamp,
    signature,
  };
}

export async function discardModeratorEvidenceUpload(userId: string, ticketId: string) {
  const db = getFirestoreDb();
  const ref = db.collection("moderator_identity_uploads").doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("user_id") !== userId) throw new Error("Evidence upload not found.");
  if (snap.get("status") === "discarded") return { ok: true as const };
  if (snap.get("status") !== "issued") throw new Error("This evidence is already submitted for review.");
  await destroyAuthenticatedImage(String(snap.get("cloudinary_public_id") ?? ""));
  await ref.update({ status: "discarded", discarded_at: new Date().toISOString() });
  return { ok: true as const };
}

export async function submitModeratorIdentityEvidence(userId: string, receipts: EvidenceReceipt[]) {
  const slots = receipts.map((receipt) => receipt.slot);
  if (new Set(slots).size !== slots.length) throw new Error("Upload each evidence type only once.");
  const hasSelfie = slots.includes("selfie");
  const hasIdSet = slots.includes("id_front") && slots.includes("id_back");
  const hasPayslip = slots.includes("payslip");
  if (!hasSelfie || (!hasIdSet && !hasPayslip) || (hasPayslip && (slots.includes("id_front") || slots.includes("id_back")))) {
    throw new Error("Upload a selfie with both sides of your ID, or upload a selfie with a recent payslip.");
  }

  const db = getFirestoreDb();
  const verificationRef = db.collection("moderator_identity_verifications").doc(userId);
  const verificationSnap = await verificationRef.get();
  if (verificationSnap.get("status") === "approved") throw new Error("Your moderator identity is already verified.");
  if (verificationSnap.get("status") === "pending_review") throw new Error("Your identity check is already waiting for review.");
  const now = new Date().toISOString();
  const prepared = await Promise.all(receipts.map(async (receipt) => {
    const ticketRef = db.collection("moderator_identity_uploads").doc(receipt.ticket_id);
    const ticketSnap = await ticketRef.get();
    if (
      !ticketSnap.exists ||
      ticketSnap.get("user_id") !== userId ||
      ticketSnap.get("slot") !== receipt.slot ||
      ticketSnap.get("status") !== "issued" ||
      String(ticketSnap.get("expires_at") ?? "") <= now ||
      ticketSnap.get("cloudinary_public_id") !== receipt.public_id ||
      Number(ticketSnap.get("expected_bytes")) !== receipt.bytes ||
      String(ticketSnap.get("expected_format")) !== receipt.format ||
      receipt.bytes <= 0 ||
      receipt.bytes > MAX_IMAGE_BYTES ||
      !["jpg", "png", "webp"].includes(receipt.format.toLowerCase())
    ) {
      throw new Error("An identity image expired or could not be verified. Upload the set again.");
    }
    const valid = await verifyCloudinaryUploadResponse({
      publicId: receipt.public_id,
      version: receipt.version,
      signature: receipt.signature,
      apiSecret: getCloudinaryEvidenceConfig().apiSecret,
    });
    if (!valid) throw new Error("Cloudinary could not verify an identity image.");
    return {
      receipt,
      ticketRef,
      ticketUpdateTime: ticketSnap.updateTime,
    };
  }));

  const batch = db.batch();
  const applicationData = {
    user_id: userId,
    status: "pending_review",
    evidence_method: hasPayslip ? "payslip_and_selfie" : "id_and_selfie",
    submitted_at: now,
    updated_at: now,
    reviewed_at: null,
    reviewed_by: null,
    review_note: null,
  };
  if (verificationSnap.exists && verificationSnap.updateTime) {
    batch.update(verificationRef, applicationData, { updateTime: verificationSnap.updateTime });
  } else {
    batch.create(verificationRef, { id: userId, ...applicationData });
  }
  for (const item of prepared) {
    const id = evidenceId(userId, item.receipt.slot);
    const evidenceRef = db.collection("moderator_identity_evidence").doc(id);
    batch.set(evidenceRef, {
      id,
      user_id: userId,
      slot: item.receipt.slot,
      cloudinary_public_id: item.receipt.public_id,
      format: item.receipt.format,
      bytes: item.receipt.bytes,
      created_at: now,
    });
    if (item.ticketUpdateTime) {
      batch.update(item.ticketRef, { status: "attached", attached_at: now }, { updateTime: item.ticketUpdateTime });
    }
  }
  await batch.commit();
  return { status: "pending_review" as const };
}

export async function getMyModeratorIdentityStatus(userId: string) {
  const snap = await getFirestoreDb().collection("moderator_identity_verifications").doc(userId).get();
  if (!snap.exists) return { status: "not_submitted" as const, review_note: null, submitted_at: null };
  return {
    status: String(snap.get("status") ?? "not_submitted"),
    review_note: String(snap.get("review_note") ?? "") || null,
    submitted_at: String(snap.get("submitted_at") ?? "") || null,
  };
}

export async function listPendingModeratorIdentityReviews(actorId: string) {
  await assertCandidOfficial(actorId);
  const db = getFirestoreDb();
  const pending = await db.collection("moderator_identity_verifications").where("status", "==", "pending_review").get();
  return Promise.all(pending.docs.map(async (doc) => {
    const userId = doc.id;
    const [profileSnap, evidenceSnap] = await Promise.all([
      db.collection("profiles").doc(userId).get(),
      db.collection("moderator_identity_evidence").where("user_id", "==", userId).get(),
    ]);
    const profile = profileSnap.data() as ProfileRecord | undefined;
    const evidence = await Promise.all(evidenceSnap.docs.map(async (file) => {
      const publicId = String(file.get("cloudinary_public_id") ?? "");
      const format = String(file.get("format") ?? "jpg");
      return {
        slot: String(file.get("slot") ?? "document"),
        url: createAuthenticatedImageUrl(publicId, format, Math.floor(Date.now() / 1000) + 600),
      };
    }));
    return {
      user_id: userId,
      username: profile?.username ?? profile?.handle ?? "Member",
      method: String(doc.get("evidence_method") ?? "unknown"),
      submitted_at: String(doc.get("submitted_at") ?? ""),
      evidence,
    };
  }));
}

export async function reviewModeratorIdentity(input: {
  actorId: string;
  userId: string;
  decision: "approve" | "decline";
  note: string;
}) {
  await assertCandidOfficial(input.actorId);
  const db = getFirestoreDb();
  const verificationRef = db.collection("moderator_identity_verifications").doc(input.userId);
  const verificationSnap = await verificationRef.get();
  if (!verificationSnap.exists || verificationSnap.get("status") !== "pending_review") {
    throw new Error("This identity check is no longer waiting for review.");
  }
  const evidenceSnap = await db.collection("moderator_identity_evidence").where("user_id", "==", input.userId).get();
  for (const file of evidenceSnap.docs) {
    await destroyAuthenticatedImage(String(file.get("cloudinary_public_id") ?? ""));
  }

  const now = new Date().toISOString();
  const batch = db.batch();
  batch.update(verificationRef, {
    status: input.decision === "approve" ? "approved" : "declined",
    reviewed_by: input.actorId,
    reviewed_at: now,
    updated_at: now,
    review_note: input.note.trim().slice(0, 1000) || null,
  }, verificationSnap.updateTime ? { updateTime: verificationSnap.updateTime } : undefined);
  for (const file of evidenceSnap.docs) batch.delete(file.ref);
  const uploads = await db.collection("moderator_identity_uploads").where("user_id", "==", input.userId).get();
  for (const upload of uploads.docs) {
    if (upload.get("status") === "attached") batch.delete(upload.ref);
  }
  const auditRef = db.collection("moderator_identity_audit").doc(generateId());
  batch.set(auditRef, {
    id: auditRef.id,
    user_id: input.userId,
    actor_id: input.actorId,
    action: input.decision === "approve" ? "identity_approved" : "identity_declined",
    created_at: now,
  });
  await batch.commit();
  return { status: input.decision === "approve" ? "approved" as const : "declined" as const };
}
