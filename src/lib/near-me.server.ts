import { getFirestoreDb } from "./firebase.server";
import { getPublicStories, type ProfileRecord } from "./firebase-data.server";
import { accountsBlockEachOther } from "./block.server";
import { isValidMapCoordinates, type MapCoordinates } from "./map-location";
import { cacheServerRead } from "./server-cache";
import {
  formatDistance,
  haversineKm,
  isInKenya,
  locateByText,
  nearestPlace,
  peopleDistanceBucket,
  roundCoarse,
  type TextLocation,
} from "./near-me";

const GEOCODE_RETRY_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_GEOCODES_PER_REQUEST = 2;

type CompanyGeo = {
  id: string;
  slug: string | null;
  name: string;
  lat: number | null;
  lng: number | null;
  isPublic: boolean;
  verified: boolean;
  industry: string | null;
  geoAttemptedAt: number;
};

const normalize = (value: string | null | undefined) =>
  (value ?? "")
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+(city\s+)?county$/i, "")
    .trim();

function isPlaceholderName(name: string) {
  return /^(n\/?a|none|unknown|not applicable|confidential)$/i.test(name.trim());
}

/** Employer positions, cached briefly so a feed request does not re-read the directory. */
function loadCompanyGeo() {
  return cacheServerRead("near-me:company-geo", 300_000, async () => {
    const snapshot = await getFirestoreDb().collection("companies").limit(2000).get();
    const map = new Map<string, CompanyGeo>();
    for (const doc of snapshot.docs) {
      const data = doc.data() as {
        slug?: string | null;
        name?: string;
        lat?: number | null;
        lng?: number | null;
        is_public?: boolean;
        verified?: boolean;
        industry?: string | null;
        geo_attempted_at?: string | null;
      };
      const name = data.name ?? "";
      const point = { lat: Number(data.lat), lng: Number(data.lng) };
      const valid = isValidMapCoordinates(point);
      map.set(doc.id, {
        id: doc.id,
        slug: data.slug ?? null,
        name,
        lat: valid ? point.lat : null,
        lng: valid ? point.lng : null,
        isPublic: data.is_public !== false && !isPlaceholderName(name),
        verified: Boolean(data.verified),
        industry: data.industry ?? null,
        geoAttemptedAt: data.geo_attempted_at ? Date.parse(data.geo_attempted_at) || 0 : 0,
      });
    }
    return map;
  });
}

/**
 * Looks an employer up on OpenStreetMap once, then remembers the answer on the company record
 * (and the "we already tried" marker, so a miss is not retried for 30 days). The result must sit
 * in Kenya and near the county/area the contributors named, otherwise it is discarded.
 */
async function geocodeCompany(
  company: CompanyGeo,
  county: string | null,
  area: string | null,
): Promise<MapCoordinates | null> {
  const hint = locateByText(county, area);
  const attemptedAt = new Date().toISOString();
  let found: MapCoordinates | null = null;
  try {
    const query = [company.name, area, county, "Kenya"].filter(Boolean).join(", ");
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      countrycodes: "ke",
    }).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "CandidKenya/1.0 (workplace stories; employer location lookup)",
          "Accept-Language": "en",
        },
        signal: controller.signal,
      });
      if (response.ok) {
        const rows = (await response.json()) as Array<{ lat: string; lon: string }>;
        const candidate = rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null;
        if (candidate && isInKenya(candidate)) {
          const reach = hint?.precision === "area" ? 60 : hint ? 150 : Infinity;
          if (!hint || haversineKm(candidate, hint) <= reach) found = candidate;
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.warn("[near-me] geocode failed", company.id, error);
  }
  try {
    await getFirestoreDb()
      .collection("companies")
      .doc(company.id)
      .set(
        found
          ? { lat: found.lat, lng: found.lng, geo_source: "osm", geo_attempted_at: attemptedAt }
          : { geo_attempted_at: attemptedAt },
        { merge: true },
      );
  } catch (error) {
    console.warn("[near-me] could not save geocode result", company.id, error);
  }
  company.geoAttemptedAt = Date.parse(attemptedAt);
  if (found) {
    company.lat = found.lat;
    company.lng = found.lng;
  }
  return found;
}

/** The shared story list hides company links; restore them for employers that are public. */
function withCompanySlug<T extends { company_id: string | null; company_slug: string | null }>(
  story: T,
  companies: Map<string, CompanyGeo>,
): T {
  const company = story.company_id ? companies.get(story.company_id) : undefined;
  return {
    ...story,
    company_slug: company?.isPublic ? (company.slug ?? story.company_slug) : null,
  };
}

type StoryPoint = {
  point: MapCoordinates;
  precision: "pin" | "company" | TextLocation["precision"];
};

export async function readNearMeFeed(input: {
  lat: number;
  lng: number;
  radiusKm: number;
  viewerId: string | null;
}) {
  const origin = { lat: input.lat, lng: input.lng };
  const here = nearestPlace(origin);
  const hereCounty = here?.place.county ?? null;
  const [stories, companies] = await Promise.all([
    getPublicStories({ sort: "new", limit: 0, viewerId: input.viewerId }),
    loadCompanyGeo(),
  ]);

  // Employers with stories close to the member but no known position get looked up once.
  const wanted = new Map<
    string,
    { company: CompanyGeo; county: string | null; area: string | null; count: number }
  >();
  for (const story of stories) {
    const company = story.company_id ? companies.get(story.company_id) : undefined;
    if (!company || company.lat !== null || !company.isPublic) continue;
    if (Date.now() - company.geoAttemptedAt < GEOCODE_RETRY_MS) continue;
    const hint = locateByText(story.county, story.area);
    if (!hint || haversineKm(origin, hint) > input.radiusKm + 40) continue;
    const entry = wanted.get(company.id);
    if (entry) entry.count += 1;
    else
      wanted.set(company.id, {
        company,
        county: story.county ?? null,
        area: story.area ?? null,
        count: 1,
      });
  }
  const toGeocode = [...wanted.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_GEOCODES_PER_REQUEST);
  for (const entry of toGeocode) await geocodeCompany(entry.company, entry.county, entry.area);

  const rows: Array<{
    story: (typeof stories)[number];
    rank: number;
    km: number;
    near: { match: "employer" | "area" | "county"; distance_km: number | null; label: string };
  }> = [];
  const employers = new Map<
    string,
    { company: CompanyGeo; km: number; stories: number; area: string | null }
  >();

  for (const story of stories) {
    const company = story.company_id ? companies.get(story.company_id) : undefined;
    const pin = { lat: Number(story.workplace_lat), lng: Number(story.workplace_lng) };
    let located: StoryPoint | null = null;
    if (isValidMapCoordinates(pin)) located = { point: pin, precision: "pin" };
    else if (company && company.lat !== null && company.lng !== null)
      located = { point: { lat: company.lat, lng: company.lng }, precision: "company" };
    else {
      const text = locateByText(story.county, story.area);
      if (text) located = { point: { lat: text.lat, lng: text.lng }, precision: text.precision };
    }
    if (!located) continue;
    const km = haversineKm(origin, located.point);

    if (located.precision === "pin" || located.precision === "company") {
      if (km > input.radiusKm) continue;
      rows.push({
        story,
        rank: 0,
        km,
        near: {
          match: "employer",
          distance_km: Math.round(km * 10) / 10,
          label: `${formatDistance(km)} away`,
        },
      });
      if (company?.isPublic && company.slug) {
        const entry = employers.get(company.id);
        if (entry) entry.stories += 1;
        else employers.set(company.id, { company, km, stories: 1, area: story.area ?? null });
      }
    } else if (located.precision === "area") {
      if (km > input.radiusKm) continue;
      rows.push({
        story,
        rank: 1,
        km,
        near: { match: "area", distance_km: null, label: `In ${story.area ?? "your area"}` },
      });
    } else if (hereCounty && normalize(story.county) === normalize(hereCounty)) {
      rows.push({
        story,
        rank: 2,
        km,
        near: { match: "county", distance_km: null, label: "In your county" },
      });
    }
  }

  rows.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.rank < 2 ? a.km - b.km : 0) ||
      Date.parse(b.story.created_at ?? "") - Date.parse(a.story.created_at ?? ""),
  );

  return {
    place: { label: here?.place.name ?? hereCounty ?? "you", county: hereCounty },
    stories: rows
      .slice(0, 80)
      .map((row) => ({ ...withCompanySlug(row.story, companies), near: row.near })),
    employers: [...employers.values()]
      .sort((a, b) => a.km - b.km)
      .slice(0, 12)
      .map((entry) => ({
        company_id: entry.company.id,
        slug: entry.company.slug as string,
        name: entry.company.name,
        verified: entry.company.verified,
        industry: entry.company.industry,
        area: entry.area,
        story_count: entry.stories,
        distance_km: Math.round(entry.km * 10) / 10,
        distance_label: `${formatDistance(entry.km)} away`,
      })),
  };
}

/** Stories from accounts the viewer follows. */
export async function readLensStories(viewerId: string) {
  const db = getFirestoreDb();
  const ids = new Set<string>();
  const snapshot = await db
    .collection("follows")
    .where("follower_id", "==", viewerId)
    .limit(1000)
    .get();
  for (const doc of snapshot.docs) {
    if (doc.get("status") === "pending") continue;
    ids.add(String(doc.get("following_id")));
  }
  if (!ids.size) return [];
  const [stories, companies] = await Promise.all([
    getPublicStories({ sort: "new", limit: 0, viewerId }),
    loadCompanyGeo(),
  ]);
  return stories
    .filter((story) => Boolean(story.author_id && ids.has(story.author_id)))
    .slice(0, 100)
    .map((story) => withCompanySlug(story, companies));
}

type PresenceRecord = {
  user_id: string;
  active: boolean;
  lat_c: number;
  lng_c: number;
  county: string | null;
  area: string | null;
  updated_at: string;
};

/** Own settings for the "people nearby" switch. Coordinates are never sent back. */
export async function readMyNearMe(userId: string) {
  const snapshot = await getFirestoreDb().collection("near_me_presence").doc(userId).get();
  const data = snapshot.data() as PresenceRecord | undefined;
  return {
    peopleVisible: Boolean(data?.active),
    area: data?.active ? (data.area ?? data.county ?? null) : null,
  };
}

/**
 * Opt in or out of being listed to followers/following who also opted in. Only a coarse ~5 km
 * cell and its nearest place name are kept; the exact position is never sent here.
 */
export async function writeMyNearMe(
  userId: string,
  input: { enabled: boolean; lat?: number; lng?: number },
) {
  const ref = getFirestoreDb().collection("near_me_presence").doc(userId);
  if (!input.enabled) {
    await ref.delete().catch(() => undefined);
    return { peopleVisible: false, area: null };
  }
  const point = { lat: Number(input.lat), lng: Number(input.lng) };
  if (!isValidMapCoordinates(point) || !isInKenya(point)) {
    throw new Error("Near me works inside Kenya. Choose a location in Kenya to continue.");
  }
  const nearest = nearestPlace(point);
  const close = nearest && nearest.distanceKm <= 25;
  const record: PresenceRecord = {
    user_id: userId,
    active: true,
    lat_c: roundCoarse(point.lat),
    lng_c: roundCoarse(point.lng),
    county: nearest?.place.county ?? null,
    area: close ? nearest.place.name : (nearest?.place.county ?? null),
    updated_at: new Date().toISOString(),
  };
  await ref.set(record);
  return { peopleVisible: true, area: record.area };
}

export async function readNearbyPeople(
  viewerId: string,
  input: { lat: number; lng: number; radiusKm: number },
) {
  const db = getFirestoreDb();
  const origin = { lat: input.lat, lng: input.lng };
  const mine = await db.collection("near_me_presence").doc(viewerId).get();
  // Mutual by design: you only see people nearby if you are listed too.
  if (!mine.exists || !(mine.data() as PresenceRecord).active) {
    return { optedIn: false, people: [] as NearbyPerson[] };
  }
  const [following, followers, presence] = await Promise.all([
    db.collection("follows").where("follower_id", "==", viewerId).limit(1000).get(),
    db.collection("follows").where("following_id", "==", viewerId).limit(1000).get(),
    db.collection("near_me_presence").where("active", "==", true).limit(1000).get(),
  ]);
  const followingIds = new Set(
    following.docs
      .filter((doc) => doc.get("status") !== "pending")
      .map((doc) => String(doc.get("following_id"))),
  );
  const followerIds = new Set(
    followers.docs
      .filter((doc) => doc.get("status") !== "pending")
      .map((doc) => String(doc.get("follower_id"))),
  );

  const candidates = presence.docs
    .map((doc) => doc.data() as PresenceRecord)
    .filter((entry) => entry.user_id !== viewerId)
    .filter((entry) => followingIds.has(entry.user_id) || followerIds.has(entry.user_id))
    .map((entry) => ({
      entry,
      km: haversineKm(origin, { lat: entry.lat_c, lng: entry.lng_c }),
    }))
    // The stored cell is rounded to ~5 km, so allow that much slack at the edge.
    .filter(({ km }) => km <= input.radiusKm + 6)
    .sort((a, b) => a.km - b.km)
    .slice(0, 40);

  const people: NearbyPerson[] = [];
  for (const { entry, km } of candidates) {
    if (people.length >= 24) break;
    const profileSnapshot = await db.collection("profiles").doc(entry.user_id).get();
    const profile = profileSnapshot.data() as ProfileRecord | undefined;
    if (
      !profile ||
      profile.banned ||
      !profile.username ||
      (profile.account_status && profile.account_status !== "active")
    )
      continue;
    if (await accountsBlockEachOther(viewerId, entry.user_id)) continue;
    const isFollowing = followingIds.has(entry.user_id);
    const isFollower = followerIds.has(entry.user_id);
    people.push({
      id: entry.user_id,
      username: profile.username,
      display_name: profile.display_name ?? null,
      photo_url: profile.photo_url ?? null,
      verified: Boolean(profile.verified),
      relation: isFollowing && isFollower ? "mutual" : isFollowing ? "following" : "follower",
      area: entry.area ?? entry.county ?? null,
      distance_label: peopleDistanceBucket(km),
    });
  }
  return { optedIn: true, people };
}

export type NearbyPerson = {
  id: string;
  username: string;
  display_name: string | null;
  photo_url: string | null;
  verified: boolean;
  relation: "following" | "follower" | "mutual";
  area: string | null;
  distance_label: string;
};
