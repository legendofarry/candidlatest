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
    algorithm === "SHA-256" ? "sha256" : "sha1",
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
