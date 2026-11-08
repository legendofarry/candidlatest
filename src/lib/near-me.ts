/**
 * Shared, side-effect free helpers for the Near me feature.
 *
 * Privacy rules baked in here:
 *  - A member's exact position never leaves their device. Anything stored on the
 *    server (only when they opt in to "people nearby") is rounded to a ~5 km cell.
 *  - People are only ever described with coarse buckets ("Within 10 km"), never an
 *    exact distance and never coordinates.
 */
import { isValidMapCoordinates, type MapCoordinates } from "./map-location";

export const NEAR_ME_RADIUS_OPTIONS = [5, 10, 25, 50] as const;
export type NearMeRadius = (typeof NEAR_ME_RADIUS_OPTIONS)[number];
export const DEFAULT_NEAR_ME_RADIUS: NearMeRadius = 10;

/** A member's location as kept on their own device. */
export type NearMeLocation = {
  lat: number;
  lng: number;
  /** Human label such as "Westlands" or "Thika". */
  label: string;
  county: string | null;
  area: string | null;
  source: "gps" | "manual";
  savedAt: number;
};

export function haversineKm(a: MapCoordinates, b: MapCoordinates) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rounds to a 0.05° grid (about 5.5 km) so a stored position is an area, not an address. */
export function roundCoarse(value: number) {
  return Math.round(value * 20) / 20;
}

export function formatDistance(km: number) {
  if (km < 1) return "Under 1 km";
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** Deliberately blunt wording for distances between two people. */
export function peopleDistanceBucket(km: number) {
  if (km <= 5) return "In your area";
  if (km <= 10) return "Within 10 km";
  if (km <= 25) return "Within 25 km";
  return "Within 50 km";
}

const COUNTY_CENTERS: Record<string, [number, number]> = {
  Mombasa: [-4.0435, 39.6682],
  Kwale: [-4.1737, 39.4521],
  Kilifi: [-3.6305, 39.8499],
  "Tana River": [-1.6, 40.0],
  Lamu: [-2.2696, 40.9006],
  "Taita-Taveta": [-3.3161, 38.485],
  Garissa: [-0.4532, 39.6461],
  Wajir: [1.7471, 40.0573],
  Mandera: [3.9373, 41.867],
  Marsabit: [2.3284, 37.9899],
  Isiolo: [0.3546, 37.5822],
  Meru: [0.048, 37.6559],
  "Tharaka-Nithi": [-0.3333, 37.65],
  Embu: [-0.5389, 37.4596],
  Kitui: [-1.3667, 38.0106],
  Machakos: [-1.5177, 37.2634],
  Makueni: [-1.8039, 37.6203],
  Nyandarua: [-0.2667, 36.3833],
  Nyeri: [-0.4201, 36.9476],
  Kirinyaga: [-0.4989, 37.2803],
  "Murang'a": [-0.721, 37.1526],
  Kiambu: [-1.0314, 36.831],
  Turkana: [3.119, 35.597],
  "West Pokot": [1.2395, 35.1119],
  Samburu: [1.0963, 36.6986],
  "Trans Nzoia": [1.0157, 35.002],
  "Uasin Gishu": [0.5143, 35.2698],
  "Elgeyo-Marakwet": [0.6703, 35.5081],
  Nandi: [0.202, 35.105],
  Baringo: [0.4919, 35.743],
  Laikipia: [0.0167, 37.0667],
  Nakuru: [-0.3031, 36.08],
  Narok: [-1.0833, 35.8667],
  Kajiado: [-1.8523, 36.782],
  Kericho: [-0.3689, 35.2863],
  Bomet: [-0.7813, 35.3416],
  Kakamega: [0.2827, 34.7519],
  Vihiga: [0.0833, 34.7167],
  Bungoma: [0.5635, 34.5606],
  Busia: [0.4608, 34.1115],
  Siaya: [0.0617, 34.2881],
  Kisumu: [-0.0917, 34.768],
  "Homa Bay": [-0.5273, 34.4571],
  Migori: [-1.0634, 34.4731],
  Kisii: [-0.6817, 34.7667],
  Nyamira: [-0.5633, 34.9358],
  Nairobi: [-1.2921, 36.8219],
};

export const KENYA_COUNTIES = Object.keys(COUNTY_CENTERS).sort((a, b) => a.localeCompare(b));

/** [name, county, lat, lng] for towns and the Nairobi neighbourhoods members most often name. */
const PLACE_ROWS: ReadonlyArray<readonly [string, string, number, number]> = [
  ["Nairobi CBD", "Nairobi", -1.2864, 36.8172],
  ["Westlands", "Nairobi", -1.2676, 36.8108],
  ["Parklands", "Nairobi", -1.263, 36.816],
  ["Kilimani", "Nairobi", -1.29, 36.785],
  ["Kileleshwa", "Nairobi", -1.276, 36.783],
  ["Lavington", "Nairobi", -1.28, 36.77],
  ["Karen", "Nairobi", -1.319, 36.707],
  ["Lang'ata", "Nairobi", -1.3667, 36.75],
  ["South C", "Nairobi", -1.32, 36.83],
  ["South B", "Nairobi", -1.31, 36.835],
  ["Eastleigh", "Nairobi", -1.275, 36.85],
  ["Pangani", "Nairobi", -1.265, 36.835],
  ["Ngara", "Nairobi", -1.275, 36.825],
  ["Kasarani", "Nairobi", -1.22, 36.9],
  ["Roysambu", "Nairobi", -1.218, 36.887],
  ["Zimmerman", "Nairobi", -1.2, 36.89],
  ["Githurai", "Nairobi", -1.198, 36.923],
  ["Kahawa West", "Nairobi", -1.18, 36.9],
  ["Kahawa Wendani", "Nairobi", -1.19, 36.93],
  ["Kahawa Sukari", "Nairobi", -1.195, 36.94],
  ["Umoja", "Nairobi", -1.28, 36.9],
  ["Buruburu", "Nairobi", -1.285, 36.875],
  ["Donholm", "Nairobi", -1.295, 36.89],
  ["Komarock", "Nairobi", -1.275, 36.91],
  ["Kayole", "Nairobi", -1.275, 36.92],
  ["Embakasi", "Nairobi", -1.32, 36.9],
  ["Utawala", "Nairobi", -1.29, 36.98],
  ["Ruai", "Nairobi", -1.28, 36.99],
  ["Dandora", "Nairobi", -1.25, 36.9],
  ["Kariobangi", "Nairobi", -1.25, 36.88],
  ["Mathare", "Nairobi", -1.26, 36.86],
  ["Huruma", "Nairobi", -1.255, 36.87],
  ["Kibera", "Nairobi", -1.313, 36.784],
  ["Kawangware", "Nairobi", -1.28, 36.748],
  ["Dagoretti", "Nairobi", -1.29, 36.75],
  ["Riruta", "Nairobi", -1.295, 36.74],
  ["Industrial Area", "Nairobi", -1.31, 36.85],
  ["Upper Hill", "Nairobi", -1.297, 36.818],
  ["Hurlingham", "Nairobi", -1.29, 36.8],
  ["Gigiri", "Nairobi", -1.23, 36.8],
  ["Runda", "Nairobi", -1.21, 36.81],
  ["Muthaiga", "Nairobi", -1.25, 36.83],
  ["Garden Estate", "Nairobi", -1.215, 36.87],
  ["Spring Valley", "Nairobi", -1.26, 36.79],
  ["Riverside", "Nairobi", -1.27, 36.8],
  ["Madaraka", "Nairobi", -1.305, 36.81],
  ["Nairobi West", "Nairobi", -1.31, 36.815],
  ["Ngong Road", "Nairobi", -1.3, 36.78],
  ["Mombasa Road", "Nairobi", -1.33, 36.86],
  ["Fedha", "Nairobi", -1.315, 36.91],
  ["Imara Daima", "Nairobi", -1.325, 36.865],
  ["Tassia", "Nairobi", -1.315, 36.895],
  ["Thika", "Kiambu", -1.0333, 37.0693],
  ["Ruiru", "Kiambu", -1.15, 36.96],
  ["Juja", "Kiambu", -1.1, 37.01],
  ["Kikuyu", "Kiambu", -1.246, 36.663],
  ["Limuru", "Kiambu", -1.105, 36.642],
  ["Ruaka", "Kiambu", -1.207, 36.774],
  ["Karuri", "Kiambu", -1.18, 36.85],
  ["Kiambu Town", "Kiambu", -1.1714, 36.8356],
  ["Githunguri", "Kiambu", -1.05, 36.76],
  ["Ngong", "Kajiado", -1.3667, 36.65],
  ["Ongata Rongai", "Kajiado", -1.395, 36.744],
  ["Kitengela", "Kajiado", -1.473, 36.95],
  ["Kiserian", "Kajiado", -1.417, 36.65],
  ["Athi River", "Machakos", -1.456, 36.978],
  ["Mlolongo", "Machakos", -1.393, 36.939],
  ["Syokimau", "Machakos", -1.36, 36.94],
  ["Machakos Town", "Machakos", -1.5177, 37.2634],
  ["Mombasa Island", "Mombasa", -4.06, 39.67],
  ["Nyali", "Mombasa", -4.02, 39.719],
  ["Bamburi", "Mombasa", -3.99, 39.72],
  ["Likoni", "Mombasa", -4.09, 39.66],
  ["Diani", "Kwale", -4.28, 39.59],
  ["Malindi", "Kilifi", -3.217, 40.117],
  ["Watamu", "Kilifi", -3.355, 40.02],
  ["Nakuru Town", "Nakuru", -0.3031, 36.08],
  ["Naivasha", "Nakuru", -0.7172, 36.431],
  ["Gilgil", "Nakuru", -0.493, 36.319],
  ["Eldoret", "Uasin Gishu", 0.5143, 35.2698],
  ["Kisumu City", "Kisumu", -0.0917, 34.768],
  ["Kakamega Town", "Kakamega", 0.2827, 34.7519],
  ["Kitale", "Trans Nzoia", 1.0157, 35.002],
  ["Nyeri Town", "Nyeri", -0.4201, 36.9476],
  ["Nanyuki", "Laikipia", 0.0167, 37.0667],
  ["Meru Town", "Meru", 0.048, 37.6559],
  ["Embu Town", "Embu", -0.5389, 37.4596],
  ["Kisii Town", "Kisii", -0.6817, 34.7667],
  ["Kericho Town", "Kericho", -0.3689, 35.2863],
  ["Bungoma Town", "Bungoma", 0.5635, 34.5606],
  ["Busia Town", "Busia", 0.4608, 34.1115],
  ["Garissa Town", "Garissa", -0.4532, 39.6461],
  ["Voi", "Taita-Taveta", -3.3961, 38.5561],
  ["Lodwar", "Turkana", 3.119, 35.597],
  ["Isiolo Town", "Isiolo", 0.3546, 37.5822],
  ["Narok Town", "Narok", -1.0833, 35.8667],
  ["Kapsabet", "Nandi", 0.202, 35.105],
  ["Chuka", "Tharaka-Nithi", -0.3333, 37.65],
  ["Kerugoya", "Kirinyaga", -0.4989, 37.2803],
  ["Murang'a Town", "Murang'a", -0.721, 37.1526],
  ["Karatina", "Nyeri", -0.4833, 37.1333],
  ["Mumias", "Kakamega", 0.3333, 34.4833],
  ["Webuye", "Bungoma", 0.6167, 34.7667],
  ["Migori Town", "Migori", -1.0634, 34.4731],
  ["Homa Bay Town", "Homa Bay", -0.5273, 34.4571],
  ["Siaya Town", "Siaya", 0.0617, 34.2881],
  ["Bomet Town", "Bomet", -0.7813, 35.3416],
  ["Kajiado Town", "Kajiado", -1.852, 36.776],
];

export type KnownPlace = { name: string; county: string; lat: number; lng: number };

const PLACES: KnownPlace[] = PLACE_ROWS.map(([name, county, lat, lng]) => ({
  name,
  county,
  lat,
  lng,
}));

const normalize = (value: string | null | undefined) =>
  (value ?? "")
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+(city\s+)?county$/i, "")
    .replace(/\s+/g, " ")
    .trim();

export function countyCenter(county: string | null | undefined): MapCoordinates | null {
  const key = Object.keys(COUNTY_CENTERS).find((name) => normalize(name) === normalize(county));
  if (!key) return null;
  const [lat, lng] = COUNTY_CENTERS[key]!;
  return { lat, lng };
}

export function nearestPlace(point: MapCoordinates) {
  let best: { place: KnownPlace; distanceKm: number } | null = null;
  for (const place of PLACES) {
    const distanceKm = haversineKm(point, place);
    if (!best || distanceKm < best.distanceKm) best = { place, distanceKm };
  }
  for (const [county, [lat, lng]] of Object.entries(COUNTY_CENTERS)) {
    const distanceKm = haversineKm(point, { lat, lng });
    if (!best || distanceKm < best.distanceKm) {
      best = { place: { name: county, county, lat, lng }, distanceKm };
    }
  }
  return best;
}

export type TextLocation = {
  lat: number;
  lng: number;
  /** "area" is a neighbourhood or town; "county" is only the county centre. */
  precision: "area" | "county";
};

/** Best-effort position for a story that only names a county and area. */
export function locateByText(
  county: string | null | undefined,
  area: string | null | undefined,
): TextLocation | null {
  const wantedCounty = normalize(county);
  const wantedArea = normalize(area);
  if (wantedArea) {
    const inCounty = PLACES.filter(
      (place) => !wantedCounty || normalize(place.county) === wantedCounty,
    );
    const pool = inCounty.length ? inCounty : PLACES;
    const exact = pool.find((place) => normalize(place.name) === wantedArea);
    const partial =
      exact ??
      pool.find((place) => {
        const name = normalize(place.name);
        return wantedArea.includes(name) || name.includes(wantedArea);
      });
    if (partial) return { lat: partial.lat, lng: partial.lng, precision: "area" };
  }
  const center = countyCenter(county);
  return center ? { ...center, precision: "county" } : null;
}

/** True when the point plausibly lies inside Kenya. */
export function isInKenya(point: MapCoordinates) {
  return (
    isValidMapCoordinates(point) &&
    point.lat >= -4.9 &&
    point.lat <= 5.2 &&
    point.lng >= 33.5 &&
    point.lng <= 42.1
  );
}

/** Builds the on-device location record from raw coordinates (GPS). */
export function locationFromCoordinates(
  point: MapCoordinates,
  source: NearMeLocation["source"],
): NearMeLocation | null {
  const nearest = nearestPlace(point);
  if (!nearest || nearest.distanceKm > 150 || !isInKenya(point)) return null;
  const close = nearest.distanceKm <= 25;
  return {
    lat: point.lat,
    lng: point.lng,
    label: close ? nearest.place.name : nearest.place.county,
    county: nearest.place.county,
    area: close ? nearest.place.name : null,
    source,
    savedAt: Date.now(),
  };
}

/** Builds the on-device location record from a chosen county and optional area. */
export function locationFromChoice(county: string, area: string | null): NearMeLocation | null {
  const located = locateByText(county, area);
  if (!located) return null;
  return {
    lat: located.lat,
    lng: located.lng,
    label: area || county,
    county,
    area: area || null,
    source: "manual",
    savedAt: Date.now(),
  };
}
