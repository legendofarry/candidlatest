import { v2 as cloudinary } from "cloudinary";

const EVIDENCE_FORMATS = new Set(["jpg", "png", "webp", "pdf"]);

export function getCloudinaryEvidenceConfig() {
  const cloudName = (
    process.env["CLOUDINARY_CLOUD_NAME"] ?? process.env["VITE_CLOUDINARY_CLOUD_NAME"]
  )?.trim();
  const apiKey = process.env["CLOUDINARY_API_KEY"]?.trim();
  const apiSecret = process.env["CLOUDINARY_API_SECRET"]?.trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Proof uploads are not configured yet. You can remove the file and still publish your story.",
    );
  }

  return { cloudName, apiKey, apiSecret };
}

export async function signCloudinaryParams(
  params: Record<string, string>,
  apiSecret: string,
  algorithm: "SHA-1" | "SHA-256" = "SHA-1",
) {
  return cloudinary.utils.api_sign_request(
    params,
    apiSecret.trim(),
  );
}

/** Short-lived, signed delivery URL for an authenticated Cloudinary image. */
export function createAuthenticatedImageUrl(publicId: string, format: string, expiresAt: number) {
  const config = getCloudinaryEvidenceConfig();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: "image",
    type: "authenticated",
    expires_at: expiresAt,
    attachment: false,
  });
}

/** Permanently removes an authenticated evidence image from Cloudinary. */
export async function destroyAuthenticatedImage(publicId: string) {
  const config = getCloudinaryEvidenceConfig();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params = {
    invalidate: "true",
    public_id: publicId,
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
    throw new Error(result.error?.message || "The private evidence image could not be removed.");
  }
}

export async function verifyCloudinaryUploadResponse(input: {
  publicId: string;
  version: number;
  signature: string;
  apiSecret: string;
}) {
  if (!/^[a-f0-9]{40,64}$/i.test(input.signature)) return false;
  const params = { public_id: input.publicId, version: String(input.version) };
  const expected = await Promise.all([
    signCloudinaryParams(params, input.apiSecret, "SHA-1"),
    signCloudinaryParams(params, input.apiSecret, "SHA-256"),
  ]);
  const supplied = input.signature.toLowerCase();
  return expected.some(
    (candidate) => candidate.length === supplied.length && candidate === supplied,
  );
}

export function isAllowedEvidenceFormat(format: string) {
  return EVIDENCE_FORMATS.has(format.toLowerCase());
}
