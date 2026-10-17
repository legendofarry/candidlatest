import { timingSafeEqual } from "node:crypto";
import { generateId } from "./firebase-data.server";
import { getFirestoreDb } from "./firebase.server";
import type { CollectionReference, Query, QueryDocumentSnapshot } from "./firestore-rest.server";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const buckets = new Map<string, { count: number; resetAt: number }>();

export const jsonHeaders = { "content-type": "application/json; charset=utf-8" } as const;

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function keysMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function rateLimited(request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_PER_WINDOW;
}

/**
 * Verifies the `x-owner-key` header against the OWNER_API_KEY secret.
 * Returns a Response to send back when the request must be rejected, or null when authorised.
 */
export function verifyOwnerKey(request: Request): Response | null {
  const expected = process.env["OWNER_API_KEY"];
  if (!expected) return json({ error: "Owner API is not configured" }, 503);

  const provided = request.headers.get("x-owner-key") ?? "";
  if (!provided || !keysMatch(provided, expected)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (rateLimited(request)) {
    return json({ error: "Too many requests" }, 429);
  }
  return null;
}

export async function getAdmin() {
  return getFirestoreDb();
}

export async function logOwnerAction(input: {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  payload?: unknown;
}) {
  const db = await getAdmin();
  const id = generateId();
  await db
    .collection("owner_audit_log")
    .doc(id)
    .set({
      id,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      payload: input.payload ?? null,
      created_at: new Date().toISOString(),
    });
}

export async function auditOwnerAction(input: Parameters<typeof logOwnerAction>[0]) {
  try {
    await logOwnerAction(input);
  } catch (error) {
    console.error("[owner audit] Could not persist action", error);
  }
}

export function pagination(url: URL) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  return { limit, offset, cursor: decodePageCursor(url.searchParams.get("cursor")) };
}

export function decodePageCursor(raw: string | null): { value: string; id: string } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      value?: unknown;
      id?: unknown;
    };
    if (typeof value.value !== "string" || typeof value.id !== "string") return null;
    return { value: value.value, id: value.id };
  } catch {
    return null;
  }
}

export function encodePageCursor(value: string, id: string) {
  return Buffer.from(JSON.stringify({ value, id }), "utf8").toString("base64url");
}

/** Reads one bounded admin-list page. Cursor requests use constant-size reads; offset is
 * retained for older clients and capped so it cannot accidentally scan an entire collection. */
export async function readOwnerPage(
  query: Query,
  collection: CollectionReference,
  options: ReturnType<typeof pagination>,
  orderField: string,
) {
  const total = await query.count();
  const { limit, offset, cursor } = options;
  let pageQuery = query;
  let effectiveOffset = offset;
  if (cursor) {
    pageQuery = pageQuery.startAfter(cursor.value, collection.doc(cursor.id));
    effectiveOffset = 0;
  }
  const skipped = Math.min(effectiveOffset, 2_000);
  const docs = (await pageQuery.limit(skipped + limit + 1).get()).docs;
  const page = docs.slice(skipped, skipped + limit);
  const hasMore = docs.length > skipped + limit;
  const last = page.at(-1) as QueryDocumentSnapshot | undefined;
  const rawOrderValue = last?.data()[orderField];
  const nextCursor = hasMore && last && rawOrderValue != null
    ? encodePageCursor(String(rawOrderValue), last.id)
    : null;
  return { docs: page, total, limit, offset: cursor ? 0 : offset, hasMore, nextCursor };
}

export function ownerPageMetadata<T extends { docs: unknown[] }>(page: T) {
  const { docs: _docs, ...metadata } = page;
  return metadata;
}
