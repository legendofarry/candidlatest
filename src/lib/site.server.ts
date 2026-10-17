import { getFirestoreDb } from "./firebase.server";
import { type StoryRecord } from "./firebase-data.server";
import { cacheServerRead } from "./server-cache";

/** "How to reach us" block shown on the About screen, editable by the owner. */
export type SiteContact = {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  x: string | null;
  instagram: string | null;
  note: string | null;
  updated_at: string | null;
};

const CONTACT_DOC = "contact";

const EMPTY_CONTACT: SiteContact = {
  email: null,
  phone: null,
  whatsapp: null,
  x: null,
  instagram: null,
  note: null,
  updated_at: null,
};

export async function readSiteContact(): Promise<SiteContact> {
  const db = getFirestoreDb();
  const snap = await db.collection("site_settings").doc(CONTACT_DOC).get();
  if (!snap.exists) return EMPTY_CONTACT;
  return { ...EMPTY_CONTACT, ...(snap.data() as Partial<SiteContact>) };
}

export async function writeSiteContact(input: Partial<SiteContact>): Promise<SiteContact> {
  const db = getFirestoreDb();
  const next: SiteContact = {
    ...EMPTY_CONTACT,
    ...(await readSiteContact()),
    ...input,
    updated_at: new Date().toISOString(),
  };
  await db.collection("site_settings").doc(CONTACT_DOC).set(next, { merge: true });
  return next;
}

/** Live numbers behind Candid Pulse. */
export type PulseSnapshot = {
  storiesTotal: number;
  storiesLast7Days: number;
  storiesLast24Hours: number;
  companies: number;
  counties: number;
  voices: number;
  topReasons: { reason: string; count: number }[];
  latestAt: string | null;
  generatedAt: string;
};

async function calculatePulse(): Promise<PulseSnapshot> {
  const db = getFirestoreDb();
  const now = Date.now();
  const week = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const day = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const publishedQuery = db.collection("stories").where("status", "==", "published");
  const [storyCount, weekCount, dayCount, companyCount, voiceCount, recentStories] =
    await Promise.all([
      publishedQuery.count(),
      publishedQuery.where("created_at", ">=", week).count(),
      publishedQuery.where("created_at", ">=", day).count(),
      db.collection("companies").count(),
      db.collection("profiles").count(),
      publishedQuery.orderBy("created_at", "desc").limit(100).get(),
    ]);
  const published = recentStories.docs.map(
    (doc) => ({ ...(doc.data() as StoryRecord), id: doc.id }) as StoryRecord,
  );

  const reasonTally = new Map<string, number>();
  for (const story of published) {
    for (const reason of story.reasons ?? []) {
      reasonTally.set(reason, (reasonTally.get(reason) ?? 0) + 1);
    }
  }

  // Keep this qualitative summary bounded; totals above use Firestore aggregates.
  const counties = new Set(published.map((story) => story.county).filter(Boolean));

  const latest = published
    .map((story) => story.created_at)
    .sort()
    .at(-1);

  return {
    storiesTotal: storyCount,
    storiesLast7Days: weekCount,
    storiesLast24Hours: dayCount,
    companies: companyCount,
    counties: counties.size,
    voices: voiceCount,
    topReasons: [...reasonTally.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4),
    latestAt: latest ?? null,
    generatedAt: new Date().toISOString(),
  };
}

export function buildPulse(): Promise<PulseSnapshot> {
  return cacheServerRead("public:pulse", 60_000, calculatePulse);
}
