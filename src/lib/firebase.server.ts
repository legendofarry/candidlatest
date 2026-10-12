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

let messagingToken: { value: string; expiresAt: number; projectId: string } | undefined;

/** Mints a short-lived OAuth token for sending Firebase Cloud Messaging notifications. */
export async function getFirebaseMessagingCredentials() {
  const credentials = parseServiceAccount();
  if (messagingToken && messagingToken.projectId === credentials.projectId && messagingToken.expiresAt > Date.now() + 60_000) {
    return { accessToken: messagingToken.value, projectId: credentials.projectId };
  }
  const key = await importPKCS8(credentials.privateKey, "RS256");
  const issuedAt = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(credentials.clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 3600)
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Firebase messaging authorization failed (${response.status}).`);
  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error("Firebase did not return a messaging access token.");
  messagingToken = {
    value: result.access_token,
    projectId: credentials.projectId,
    expiresAt: Date.now() + Math.max(60, result.expires_in ?? 3600) * 1000,
  };
  return { accessToken: result.access_token, projectId: credentials.projectId };
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
