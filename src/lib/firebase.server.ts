import { createPrivateKey } from "node:crypto";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccountInput = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

let firebaseAdminApp: App | undefined;

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

function isUsableKey(key: string | undefined): key is string {
  if (!key) return false;
  try {
    createPrivateKey(normalizePrivateKey(key));
    return true;
  } catch {
    return false;
  }
}

/** Read credentials from the service-account JSON, falling back to the individual variables. */
function parseServiceAccount(): ServiceAccountInput {
  const rawJson = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as {
        project_id?: string;
        projectId?: string;
        client_email?: string;
        clientEmail?: string;
        private_key?: string;
        privateKey?: string;
      };
      const projectId = parsed.project_id ?? parsed.projectId ?? process.env["FIREBASE_PROJECT_ID"];
      const clientEmail = parsed.client_email ?? parsed.clientEmail;
      const privateKey = parsed.private_key ?? parsed.privateKey;
      if (projectId && clientEmail && isUsableKey(privateKey)) {
        return { projectId, clientEmail, privateKey: normalizePrivateKey(privateKey) };
      }
      console.warn(
        "[firebase] FIREBASE_SERVICE_ACCOUNT_JSON is incomplete or unreadable; using FIREBASE_* variables instead.",
      );
    } catch (error) {
      console.warn("[firebase] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.", error);
    }
  }

  const projectId = process.env["FIREBASE_PROJECT_ID"] ?? "candid-431db";
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];
  const privateKey = process.env["FIREBASE_PRIVATE_KEY"];
  if (!clientEmail || !isUsableKey(privateKey)) {
    throw new Error(
      "Missing Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
    );
  }
  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
  };
}

export function getFirebaseAdminApp() {
  if (!firebaseAdminApp) {
    const existing = getApps();
    if (existing.length > 0) {
      firebaseAdminApp = existing[0]!;
    } else {
      const serviceAccount = parseServiceAccount();
      firebaseAdminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId,
      });
    }
  }

  return firebaseAdminApp;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirestoreDb() {
  return getFirestore(getFirebaseAdminApp());
}
