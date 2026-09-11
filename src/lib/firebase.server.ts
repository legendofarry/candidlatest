import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccountInput = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

let firebaseAdminApp: App | undefined;

function parseServiceAccount(): ServiceAccountInput {
  const rawJson = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (rawJson) {
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
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON must include project_id, client_email and private_key.",
      );
    }
    return {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    };
  }

  const projectId = process.env["FIREBASE_PROJECT_ID"] ?? "candid-431db";
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];
  const privateKey = process.env["FIREBASE_PRIVATE_KEY"];
  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
    );
  }
  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
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
