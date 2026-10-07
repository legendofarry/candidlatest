const EVIDENCE_FORMATS = new Set(["jpg", "png", "webp", "pdf"]);

export function getCloudinaryEvidenceConfig() {
  const cloudName =
    process.env["CLOUDINARY_CLOUD_NAME"] ?? process.env["VITE_CLOUDINARY_CLOUD_NAME"];
  const apiKey = process.env["CLOUDINARY_API_KEY"];
  const apiSecret = process.env["CLOUDINARY_API_SECRET"];

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Proof uploads are not configured yet. You can remove the file and still publish your story.",
    );
  }

  return { cloudName, apiKey, apiSecret };
}

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signCloudinaryParams(
  params: Record<string, string>,
  apiSecret: string,
  algorithm: "SHA-1" | "SHA-256" = "SHA-1",
) {
  const serialized = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const bytes = new TextEncoder().encode(`${serialized}${apiSecret}`);
  return toHex(await crypto.subtle.digest(algorithm, bytes));
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
