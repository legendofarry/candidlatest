const ADJECTIVES = [
  "Mellow", "Bright", "Nova", "Cedar", "Orbit", "Kindred", "Quiet", "Clever",
  "Neon", "Rogue", "Pixel", "Turbo", "Echo", "Zest", "Steady", "Velvet",
  "Urban", "Golden", "Silver", "Brisk", "Sage", "Noble", "Harbor", "North",
];

const NOUNS = [
  "Comet", "Kite", "Raven", "River", "Rebel", "Nomad", "Lantern", "Pioneer",
  "Marble", "Acacia", "Drifter", "Badger", "Sparrow", "Compass", "Sunbird", "Mosaic",
  "Clover", "Current", "Trail", "Cinder", "Jasper", "Breeze", "Anchor", "Voyager",
  "Orbit", "Tempo", "Ember", "Monsoon", "Maple", "Nimbus", "Signal", "Meadow",
  "Rhythm", "Atlas", "Fable", "Quartz", "Tide", "Saffron", "Beacon", "Lumen",
  "Mango", "Acrobat", "Panda", "Canyon", "Fig", "Tamarind", "Tinker", "Dhow",
  "Kifaru", "Kiboko", "Mwamba", "Twiga", "Safari", "Chai", "Mwangaza", "Kivuli",
];

function randomIndex(max: number) {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return bytes[0]! % max;
}

/** Creates a fresh alias using the starter word only as hidden entropy, never as visible text. */
export function generateAliasCandidate(
  seed: string,
  round = 0,
) {
  const starter = seed.trim().toLowerCase();
  const starterSignal = [...starter].reduce((total, character) => total + character.charCodeAt(0), 0);
  const first = ADJECTIVES[(randomIndex(ADJECTIVES.length) + starterSignal + round) % ADJECTIVES.length]!;
  const second = NOUNS[(randomIndex(NOUNS.length) + starterSignal + round) % NOUNS.length]!;
  const suffix = String(randomIndex(90) + 10);
  let candidate = `${first}${second}${suffix}`.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Keep the result under the username limit without cutting away its random ending.
  if (candidate.length > 20) candidate = `${candidate.slice(0, 18)}${suffix}`;
  return candidate;
}
