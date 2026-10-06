/**
 * Minimal Firestore client over the REST API. Works on edge runtimes where
 * firebase-admin (gRPC, node:* modules) cannot load. Mirrors the subset of the
 * admin SDK surface this app uses.
 */
import { importPKCS8, SignJWT } from "jose";

export type DocumentData = Record<string, any>;
type Credentials = { projectId: string; clientEmail: string; privateKey: string };
type FsValue = any;

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const quote = (seg: string) => (IDENT.test(seg) ? seg : "`" + seg.replace(/[`\\]/g, "\\$&") + "`");

function encode(value: unknown): FsValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number")
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === "object")
    return { mapValue: { fields: encodeFields(value as DocumentData) } };
  return { stringValue: String(value) };
}
function encodeFields(data: DocumentData) {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = encode(v);
  return out;
}
function decode(v: FsValue): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("bytesValue" in v) return v.bytesValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decode);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  return null;
}
function decodeFields(fields: Record<string, FsValue>): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v);
  return out;
}
function leafPaths(data: DocumentData, prefix: string[] = []): string[] {
  const paths: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const path = [...prefix, k];
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof Date) &&
      !(v instanceof FieldTransform) &&
      Object.keys(v).length
    )
      paths.push(...leafPaths(v, path));
    else paths.push(path.map(quote).join("."));
  }
  return paths;
}
/** Turn {"a.b": 1} update keys into nested data plus field paths. */
function expandUpdate(data: DocumentData) {
  const nested: DocumentData = {};
  const paths: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const segs = key.split(".");
    let cur = nested;
    segs.slice(0, -1).forEach((s) => (cur = cur[s] ??= {}));
    cur[segs[segs.length - 1]!] = value;
    paths.push(segs.map(quote).join("."));
  }
  return { nested, paths };
}

export class DocumentSnapshot {
  constructor(
    readonly id: string,
    readonly ref: DocumentReference,
    private readonly fields: DocumentData | undefined,
  ) {}
  get exists() {
    return this.fields !== undefined;
  }
  data(): any {
    return this.fields ? { ...this.fields } : undefined;
  }
  get(field: string) {
    return field
      .split(".")
      .reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), this.fields);
  }
}
export type QueryDocumentSnapshot<_T = DocumentData> = DocumentSnapshot & { data(): DocumentData };

export class QuerySnapshot {
  constructor(readonly docs: QueryDocumentSnapshot[]) {}
  get empty() {
    return this.docs.length === 0;
  }
  get size() {
    return this.docs.length;
  }
  forEach(cb: (d: QueryDocumentSnapshot) => void) {
    this.docs.forEach(cb);
  }
}

type Write = Record<string, unknown>;
type SetOptions = { merge?: boolean };

abstract class FieldTransform {}

class IncrementTransform extends FieldTransform {
  constructor(readonly operand: number) { super(); }
}
class ArrayUnionTransform extends FieldTransform {
  constructor(readonly operands: unknown[]) {
    super();
  }
}
class ArrayRemoveTransform extends FieldTransform {
  constructor(readonly operands: unknown[]) {
    super();
  }
}

function stripTransforms(data: DocumentData): DocumentData {
  const result: DocumentData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof FieldTransform) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      const stripped = stripTransforms(value as DocumentData);
      if (Object.keys(stripped).length > 0 || Object.keys(value).length === 0) {
        result[key] = stripped;
      }
    } else result[key] = value;
  }
  return result;
}

/** Firestore field transforms supported by the REST client. */
export const FieldValue = {
  increment(operand: number) {
    return new IncrementTransform(operand);
  },
  arrayUnion(...operands: unknown[]) {
    return new ArrayUnionTransform(operands);
  },
  arrayRemove(...operands: unknown[]) {
    return new ArrayRemoveTransform(operands);
  },
};

export class DocumentReference {
  constructor(
    readonly db: Firestore,
    readonly path: string,
  ) {}
  get id() {
    return this.path.split("/").pop()!;
  }
  get name() {
    return `${this.db.root}/${this.path}`;
  }
  collection(name: string) {
    return new CollectionReference(this.db, `${this.path}/${name}`);
  }
  async get() {
    const res = await this.db.request(`/${this.path}`, { method: "GET" }, true);
    if (!res) return new DocumentSnapshot(this.id, this, undefined);
    return new DocumentSnapshot(this.id, this, decodeFields(res.fields ?? {}));
  }
  setWrite(data: DocumentData, options?: SetOptions): Write {
    const w: Write = { update: { name: this.name, fields: encodeFields(data) } };
    if (options?.merge) w["updateMask"] = { fieldPaths: leafPaths(data) };
    return w;
  }
  updateWrite(data: DocumentData): Write {
    const { nested, paths } = expandUpdate(data);
    const fieldTransforms: Array<Record<string, unknown>> = [];
    const transformedPaths = new Set<string>();
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const fieldPath = key.split(".").map(quote).join(".");
      if (value instanceof IncrementTransform) {
        fieldTransforms.push({ fieldPath, increment: encode(value.operand) });
        transformedPaths.add(fieldPath);
      } else if (value instanceof ArrayUnionTransform) {
        fieldTransforms.push({
          fieldPath,
          appendMissingElements: { values: value.operands.map(encode) },
        });
        transformedPaths.add(fieldPath);
      } else if (value instanceof ArrayRemoveTransform) {
        fieldTransforms.push({
          fieldPath,
          removeAllFromArray: { values: value.operands.map(encode) },
        });
        transformedPaths.add(fieldPath);
      }
    }
    const updatePaths = paths.filter((path) => !transformedPaths.has(path));

    if (fieldTransforms.length > 0 && updatePaths.length === 0) {
      return {
        transform: { document: this.name, fieldTransforms },
        currentDocument: { exists: true },
      };
    }

    return {
      update: { name: this.name, fields: encodeFields(stripTransforms(nested)) },
      updateMask: { fieldPaths: updatePaths },
      ...(fieldTransforms.length > 0 ? { updateTransforms: fieldTransforms } : {}),
      currentDocument: { exists: true },
    };
  }
  deleteWrite(): Write {
    return { delete: this.name };
  }
  set(data: DocumentData, options?: SetOptions) {
    return this.db.commit([this.setWrite(data, options)]);
  }
  update(data: DocumentData) {
    return this.db.commit([this.updateWrite(data)]);
  }
  delete() {
    return this.db.commit([this.deleteWrite()]);
  }
}

type Filter = { field: string; op: string; value: unknown };
const OPS: Record<string, string> = {
  "==": "EQUAL",
  "!=": "NOT_EQUAL",
  "<": "LESS_THAN",
  "<=": "LESS_THAN_OR_EQUAL",
  ">": "GREATER_THAN",
  ">=": "GREATER_THAN_OR_EQUAL",
  "array-contains": "ARRAY_CONTAINS",
  "array-contains-any": "ARRAY_CONTAINS_ANY",
  in: "IN",
  "not-in": "NOT_IN",
};

export class Query {
  constructor(
    readonly db: Firestore,
    readonly path: string,
    protected filters: Filter[] = [],
    protected orders: { field: string; dir: string }[] = [],
    protected max?: number,
  ) {}
  where(field: string, op: string, value: unknown) {
    return new Query(
      this.db,
      this.path,
      [...this.filters, { field, op, value }],
      this.orders,
      this.max,
    );
  }
  orderBy(field: string, dir: "asc" | "desc" = "asc") {
    return new Query(this.db, this.path, this.filters, [...this.orders, { field, dir }], this.max);
  }
  limit(n: number) {
    return new Query(this.db, this.path, this.filters, this.orders, n);
  }
  async get() {
    const parts = this.path.split("/");
    const collectionId = parts.pop()!;
    const parent = parts.length ? `/${parts.join("/")}` : "";
    const fieldFilters = this.filters.map((f) => ({
      fieldFilter: {
        field: { fieldPath: f.field.split(".").map(quote).join(".") },
        op: OPS[f.op] ?? "EQUAL",
        value: encode(f.value),
      },
    }));
    const structuredQuery: Record<string, unknown> = { from: [{ collectionId }] };
    if (fieldFilters.length === 1) structuredQuery["where"] = fieldFilters[0];
    else if (fieldFilters.length > 1)
      structuredQuery["where"] = { compositeFilter: { op: "AND", filters: fieldFilters } };
    if (this.orders.length)
      structuredQuery["orderBy"] = this.orders.map((o) => ({
        field: { fieldPath: o.field },
        direction: o.dir === "desc" ? "DESCENDING" : "ASCENDING",
      }));
    if (this.max) structuredQuery["limit"] = this.max;
    const rows = (await this.db.request(`${parent}:runQuery`, {
      method: "POST",
      body: JSON.stringify({ structuredQuery }),
    })) as Array<{ document?: { name: string; fields?: Record<string, FsValue> } }>;
    const docs = rows
      .filter((r) => r.document)
      .map((r) => {
        const rel = r.document!.name.slice(this.db.root.length + 1);
        const ref = new DocumentReference(this.db, rel);
        return new DocumentSnapshot(
          ref.id,
          ref,
          decodeFields(r.document!.fields ?? {}),
        ) as QueryDocumentSnapshot;
      });
    return new QuerySnapshot(docs);
  }
}

export class CollectionReference extends Query {
  get id() {
    return this.path.split("/").pop()!;
  }
  doc(id?: string) {
    return new DocumentReference(
      this.db,
      `${this.path}/${id ?? crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    );
  }
  async add(data: DocumentData) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

export class WriteBatch {
  protected writes: Write[] = [];
  constructor(protected readonly db: Firestore) {}
  set(ref: DocumentReference, data: DocumentData, options?: SetOptions) {
    this.writes.push(ref.setWrite(data, options));
    return this;
  }
  update(ref: DocumentReference, data: DocumentData) {
    this.writes.push(ref.updateWrite(data));
    return this;
  }
  delete(ref: DocumentReference) {
    this.writes.push(ref.deleteWrite());
    return this;
  }
  async commit() {
    if (this.writes.length) await this.db.commit(this.writes);
  }
}

export class Transaction extends WriteBatch {
  get(ref: DocumentReference) {
    return ref.get();
  }
}

let cachedToken: { token: string; exp: number; email: string } | undefined;

export class Firestore {
  readonly root: string;
  private readonly base: string;
  constructor(private readonly creds: Credentials) {
    this.root = `projects/${creds.projectId}/databases/(default)/documents`;
    this.base = `https://firestore.googleapis.com/v1/${this.root}`;
  }
  private async token() {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && cachedToken.email === this.creds.clientEmail && cachedToken.exp - 60 > now)
      return cachedToken.token;
    const key = await importPKCS8(this.creds.privateKey, "RS256");
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(this.creds.clientEmail)
      .setSubject(this.creds.clientEmail)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!res.ok) throw new Error(`Firestore auth failed [${res.status}]: ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      token: json.access_token,
      exp: now + json.expires_in,
      email: this.creds.clientEmail,
    };
    return json.access_token;
  }
  async request(path: string, init: RequestInit, allow404 = false): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${await this.token()}`,
        "content-type": "application/json",
      },
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore request failed [${res.status}]: ${await res.text()}`);
    return res.json();
  }
  commit(writes: Write[]) {
    return this.request(":commit", { method: "POST", body: JSON.stringify({ writes }) });
  }
  collection(name: string) {
    return new CollectionReference(this, name);
  }
  batch() {
    return new WriteBatch(this);
  }
  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = new Transaction(this);
    const result = await fn(tx);
    await tx.commit();
    return result;
  }
}
