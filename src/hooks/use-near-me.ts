import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_NEAR_ME_RADIUS,
  locationFromChoice,
  locationFromCoordinates,
  type NearMeLocation,
  type NearMeRadius,
} from "@/lib/near-me";

/**
 * Near me keeps the member's exact position on this device only (localStorage).
 * Nothing here is sent anywhere except as query parameters for nearby results.
 */
const KEY = "candid:near-me:v1";

type Stored = { location: NearMeLocation | null; radius: NearMeRadius; on: boolean };

const EMPTY: Stored = { location: null, radius: DEFAULT_NEAR_ME_RADIUS, on: false };
let state: Stored = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>;
      state = {
        location: parsed.location ?? null,
        radius: (parsed.radius as NearMeRadius) ?? DEFAULT_NEAR_ME_RADIUS,
        on: Boolean(parsed.on && parsed.location),
      };
    }
  } catch {
    state = EMPTY;
  }
}

function commit(next: Stored) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable; the choice still applies for this visit */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type GpsResult =
  | { ok: true; location: NearMeLocation }
  | { ok: false; reason: "denied" | "unavailable" | "timeout" | "outside" | "unsupported" };

export function useNearMe() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      load();
      return state;
    },
    () => EMPTY,
  );

  const requestGps = useCallback(
    (): Promise<GpsResult> =>
      new Promise((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          resolve({ ok: false, reason: "unsupported" });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = locationFromCoordinates(
              { lat: position.coords.latitude, lng: position.coords.longitude },
              "gps",
            );
            if (!location) {
              resolve({ ok: false, reason: "outside" });
              return;
            }
            commit({ ...state, location, on: true });
            resolve({ ok: true, location });
          },
          (error) =>
            resolve({
              ok: false,
              reason:
                error.code === error.PERMISSION_DENIED
                  ? "denied"
                  : error.code === error.TIMEOUT
                    ? "timeout"
                    : "unavailable",
            }),
          { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60_000 },
        );
      }),
    [],
  );

  const chooseArea = useCallback((county: string, area: string | null) => {
    const location = locationFromChoice(county, area);
    if (!location) return null;
    commit({ ...state, location, on: true });
    return location;
  }, []);

  return {
    location: snapshot.location,
    radius: snapshot.radius,
    on: snapshot.on,
    requestGps,
    chooseArea,
    setOn: useCallback((on: boolean) => commit({ ...state, on: on && Boolean(state.location) }), []),
    setRadius: useCallback((radius: NearMeRadius) => commit({ ...state, radius }), []),
    clear: useCallback(() => commit({ ...state, location: null, on: false }), []),
  };
}

/** Reports whether the browser has already blocked location, so the sheet can skip the native prompt. */
export async function geolocationPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    if (!navigator.permissions) return "unknown";
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}
