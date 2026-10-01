import { DocumentReference, GeoPoint, Timestamp } from "firebase-admin/firestore";
import JSZip from "jszip";
import { getFirebaseAdminApp, getFirebaseAuth, getFirestoreDb } from "./firebase.server";

const BACKUP_FORMAT = "candid-firestore-backup";
const BACKUP_VERSION = 1;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_BACKUP_BYTES = 300 * 1024 * 1024;

type BackupDocument = { path: string; data: Record<string, unknown> };
type DevDatabaseAccess = { db: ReturnType<typeof getFirestoreDb>; projectId: string };

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function authorizeDevDatabase(request: Request) {
  if (process.env["NODE_ENV"] !== "development") {
    return json(
      { error: "Development database tools are only available on the local dev server." },
      404,
    );
  }
  if (process.env["DEV_DATABASE_TOOLS_ENABLED"] !== "true") {
    return json(
      {
        error: "Set DEV_DATABASE_TOOLS_ENABLED=true in .env.local to enable local database tools.",
      },
      503,
    );
  }

  const expectedProjectId = process.env["DEV_DATABASE_PROJECT_ID"];
  const allowedUid = process.env["DEV_DATABASE_ADMIN_UID"];
  if (!expectedProjectId || !allowedUid) {
    return json(
      {
        error:
          "Set DEV_DATABASE_PROJECT_ID and DEV_DATABASE_ADMIN_UID to enable these development tools.",
      },
      503,
    );
  }

  try {
    const app = getFirebaseAdminApp();
    const projectId = app.options.projectId;
    if (!projectId || projectId !== expectedProjectId) {
      return json(
        { error: "The active Firebase project does not match the allowed dev project." },
        403,
      );
    }

    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "Sign in with the allowed development account." }, 401);
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    if (decoded.uid !== allowedUid) return json({ error: "This account is not allowlisted." }, 403);

    return { db: getFirestoreDb(), projectId } satisfies DevDatabaseAccess;
  } catch (error) {
    console.error("[dev database] Access check failed", error);
    return json({ error: "Could not verify development database access." }, 503);
  }
}

function encodeValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { __firestoreType: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof GeoPoint) {
    return { __firestoreType: "geopoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof DocumentReference) {
    return { __firestoreType: "reference", path: value.path };
  }
  if (value instanceof Uint8Array) {
    return { __firestoreType: "bytes", base64: Buffer.from(value).toString("base64") };
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === "object") {
    if ("__firestoreType" in value) {
      return {
        __firestoreType: "escapedObject",
        entries: Object.entries(value).map(([key, nested]) => [key, encodeValue(nested)]),
      };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, encodeValue(nested)]),
    );
  }
  return value;
}

function decodeValue(value: unknown, db: DevDatabaseAccess["db"]): unknown {
  if (Array.isArray(value)) return value.map((nested) => decodeValue(nested, db));
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  switch (record["__firestoreType"]) {
    case "timestamp":
      if (typeof record["seconds"] !== "number" || typeof record["nanoseconds"] !== "number")
        throw new Error("Invalid timestamp in backup.");
      return new Timestamp(record["seconds"], record["nanoseconds"]);
    case "geopoint":
      if (typeof record["latitude"] !== "number" || typeof record["longitude"] !== "number")
        throw new Error("Invalid geographic point in backup.");
      return new GeoPoint(record["latitude"], record["longitude"]);
    case "reference":
      if (typeof record["path"] !== "string") throw new Error("Invalid reference in backup.");
      return db.doc(record["path"]);
    case "bytes":
      if (typeof record["base64"] !== "string") throw new Error("Invalid bytes in backup.");
      return Buffer.from(record["base64"], "base64");
    case "escapedObject":
      if (!Array.isArray(record["entries"])) throw new Error("Invalid object in backup.");
      return Object.fromEntries(
        (record["entries"] as unknown[]).map((entry) => {
          if (!Array.isArray(entry) || typeof entry[0] !== "string")
            throw new Error("Invalid object entry in backup.");
          return [entry[0], decodeValue(entry[1], db)];
        }),
      );
    default:
      return Object.fromEntries(
        Object.entries(record).map(([key, nested]) => [key, decodeValue(nested, db)]),
      );
  }
}

async function collectCollection(
  collection: FirebaseFirestore.CollectionReference,
  documents: BackupDocument[],
) {
  for (const reference of await collection.listDocuments()) {
    const snapshot = await reference.get();
    if (snapshot.exists) {
      documents.push({
        path: reference.path,
        data: encodeValue(snapshot.data()) as Record<string, unknown>,
      });
    }
    for (const subcollection of await reference.listCollections()) {
      await collectCollection(subcollection, documents);
    }
  }
}

export async function createDatabaseBackup({ db, projectId }: DevDatabaseAccess) {
  const documents: BackupDocument[] = [];
  for (const collection of await db.listCollections()) {
    await collectCollection(collection, documents);
  }

  const content = JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    projectId,
    createdAt: new Date().toISOString(),
    documents,
  });
  if (Buffer.byteLength(content) > MAX_BACKUP_BYTES) {
    throw new Error("Backup is too large to package in this development server.");
  }

  const archive = new JSZip();
  archive.file("backup.json", content);
  const output = await archive.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  if (output.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Backup ZIP exceeds the 100 MB restore limit.");
  }
  return output;
}

export async function clearDatabase(db: DevDatabaseAccess["db"]) {
  const collections = await db.listCollections();
  for (const collection of collections) await db.recursiveDelete(collection);
  return collections.map((collection) => collection.id);
}

function isDocumentPath(path: string) {
  const segments = path.split("/");
  return (
    path.length <= 1500 &&
    segments.length >= 2 &&
    segments.length % 2 === 0 &&
    segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

export async function restoreDatabaseBackup(
  file: File,
  access: DevDatabaseAccess,
  confirmation: string,
) {
  if (confirmation !== access.projectId) throw new Error("Project confirmation did not match.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Backup ZIP exceeds the 100 MB limit.");

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files)
    .filter((name) => !zip.files[name]?.dir)
    .sort();
  if (names.length !== 1 || names[0] !== "backup.json") {
    throw new Error("This ZIP does not contain a valid Candid Firestore backup.");
  }

  const entry = zip.file("backup.json");
  if (!entry) throw new Error("Backup file is missing.");
  const content = await entry.async("string");
  if (Buffer.byteLength(content) > MAX_BACKUP_BYTES) throw new Error("Backup data is too large.");
  const backup = JSON.parse(content) as {
    format?: unknown;
    version?: unknown;
    projectId?: unknown;
    documents?: unknown;
  };
  if (
    backup.format !== BACKUP_FORMAT ||
    backup.version !== BACKUP_VERSION ||
    backup.projectId !== access.projectId ||
    !Array.isArray(backup.documents)
  ) {
    throw new Error("Backup format or Firebase project does not match.");
  }
  if (backup.documents.length > 100_000) throw new Error("Backup contains too many documents.");

  const documents = backup.documents.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid document in backup.");
    const record = item as Record<string, unknown>;
    if (
      typeof record["path"] !== "string" ||
      !isDocumentPath(record["path"]) ||
      !record["data"] ||
      typeof record["data"] !== "object" ||
      Array.isArray(record["data"])
    ) {
      throw new Error("Invalid document path or data in backup.");
    }
    return {
      path: record["path"],
      data: decodeValue(record["data"], access.db) as FirebaseFirestore.DocumentData,
    };
  });

  const writer = access.db.bulkWriter();
  for (const document of documents) writer.set(access.db.doc(document.path), document.data);
  await writer.close();

  return documents.length;
}

export function backupFileName() {
  return `candid-firestore-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
}

export function isBackupUploadTooLarge(request: Request) {
  const length = Number(request.headers.get("content-length"));
  return Number.isFinite(length) && length > MAX_UPLOAD_BYTES + 1024 * 1024;
}

export function badRequest(message: string) {
  return json({ error: message }, 400);
}

export function serverError(message: string) {
  return json({ error: message }, 500);
}
