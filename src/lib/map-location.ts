export type MapCoordinates = { lat: number; lng: number };

export function isValidMapCoordinates(value: MapCoordinates | null | undefined): value is MapCoordinates {
  return Boolean(
    value && Number.isFinite(value.lat) && Number.isFinite(value.lng) &&
      value.lat >= -90 && value.lat <= 90 && value.lng >= -180 && value.lng <= 180,
  );
}

/** Reads coordinates from common Google Maps links and plain `latitude,longitude` input. */
export function parseMapCoordinates(value: string | null | undefined): MapCoordinates | null {
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value.replaceAll("+", " "));
  } catch {
    // A malformed URL can still contain coordinates in its plain text.
  }
  const match =
    decoded.match(/[?&](?:q|query|ll)=\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i) ??
    decoded.match(/@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/) ??
    decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ??
    decoded.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const coordinates = { lat: Number(match[1]), lng: Number(match[2]) };
  return isValidMapCoordinates(coordinates) ? coordinates : null;
}
