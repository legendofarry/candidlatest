import { createRemoteJWKSet, jwtVerify } from "jose";
import { Firestore } from "./firestore-rest.server";

type ServiceAccountInput = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

/** Repair keys whose newlines were lost or escaped while travelling through env storage. */
function normalizePrivateKey(key: string) {
  const unescaped = key.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  const match = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(unescaped);
  if (!match) return unescaped;
  const label = match[1]!;
  const body = (match[2] ?? "").replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function looksLikeKey(key: string | undefined): key is string {
  return Boolean(key && /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(normalizePrivateKey(key)));
}

/** Read credentials from the service-account JSON, falling back to the individual variables. */
function parseServiceAccount(): ServiceAccountInput {
  const rawJson = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, string | undefined>;
      const projectId = parsed["project_id"] ?? parsed["projectId"] ?? process.env["FIREBASE_PROJECT_ID"];
      const clientEmail = parsed["client_email"] ?? parsed["clientEmail"];
      const privateKey = parsed["private_key"] ?? parsed["privateKey"];
      if (projectId && clientEmail && looksLikeKey(privateKey)) {
        return { projectId, clientEmail, privateKey: normalizePrivateKey(privateKey) };
      }
    } catch {
      /* fall through to individual variables */
    }
  }

  const projectId = process.env["FIREBASE_PROJECT_ID"] ?? "candid-431db";
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];
  const privateKey = process.env["FIREBASE_PRIVATE_KEY"];
  if (!clientEmail || !looksLikeKey(privateKey)) {
    throw new Error(
      "Missing Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
    );
  }
  return { projectId, clientEmail, privateKey: normalizePrivateKey(privateKey) };
}

let db: Firestore | undefined;

export function getFirestoreDb() {
  db ??= new Firestore(parseServiceAccount());
  return db;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/** Verifies Firebase Auth ID tokens against Google's public keys. */
export function getFirebaseAuth() {
  return {
    async verifyIdToken(token: string) {
      const projectId = process.env["FIREBASE_PROJECT_ID"] ?? "candid-431db";
      jwks ??= createRemoteJWKSet(
        new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
      );
      const { payload } = await jwtVerify(token, jwks, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      });
      if (!payload.sub) throw new Error("Invalid token subject");
      return { ...payload, uid: payload.sub } as typeof payload & { uid: string; email?: string };
    },
  };
}
