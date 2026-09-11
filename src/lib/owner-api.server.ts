import { timingSafeEqual } from "node:crypto";
import { generateId } from "./firebase-data.server";
import { getFirestoreDb } from "./firebase.server";

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

export function pagination(url: URL) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  return { limit, offset };
}
