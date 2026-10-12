export type AliasAgeRange = "18-24" | "25-34" | "35-44" | "45+" | "skip";

const WORDS_BY_AGE: Record<AliasAgeRange, readonly string[]> = {
  "18-24": ["Neon", "Rogue", "Nova", "Pixel", "Turbo", "Echo", "Orbit", "Zest"],
  "25-34": ["Mellow", "Bright", "Steady", "Velvet", "Urban", "Golden", "Quiet", "Clever"],
  "35-44": ["Cedar", "Silver", "Kindred", "Brisk", "Sage", "Noble", "Harbor", "True"],
  "45+": ["Cedar", "North", "Harbor", "Golden", "Sage", "Ever", "Kindred", "Bright"],
  skip: ["Mellow", "Bright", "Nova", "Cedar", "Orbit", "Kindred", "Quiet", "Clever"],
};

const NOUNS = [
  "Comet", "Kite", "Raven", "River", "Rebel", "Nomad", "Lantern", "Pioneer",
  "Marble", "Acacia", "Drifter", "Badger", "Sparrow", "Compass", "Sunbird", "Mosaic",
  "Clover", "Current", "Trail", "Cinder", "Jasper", "Breeze", "Anchor", "Voyager",
  "Orbit", "Tempo", "Ember", "Monsoon", "Maple", "Nimbus", "Signal", "Meadow",
  "Rhythm", "Atlas", "Fable", "Quartz", "Tide", "Saffron", "Beacon", "Lumen",
  "Mango", "Acrobat", "Panda", "Canyon", "Fig", "Tamarind", "Tinker", "Dhow",
  "Kifaru", "Kiboko", "Mwamba", "Twiga", "Safari", "Chai", "Mwangaza", "Kivuli",
];

const PERSONALITY_WORDS: readonly (readonly (readonly string[])[])[] = [
  [["Steady", "Grounded", "Patient"], ["Bold", "Brave", "Fearless"]],
  [["Dawn", "Early", "Firstlight"], ["Night", "Moonlit", "Afterglow"]],
  [["Cozy", "Kind", "Gentle"], ["Lively", "Electric", "Radiant"]],
  [["Sage", "Keen", "Quiet"], ["Scout", "Curious", "Wandering"]],
];

function randomIndex(max: number) {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return bytes[0]! % max;
}

/** Creates a fresh alias using the starter word only as hidden entropy, never as visible text. */
export function generateAliasCandidate(
  seed: string,
  answers: readonly (number | null)[],
  ageRange: AliasAgeRange,
  round = 0,
) {
  const starter = seed.trim().toLowerCase();
  const chosenWords = PERSONALITY_WORDS.map((choices, index) => {
    const selected = answers[index] === 1 ? 1 : 0;
    return choices[selected]![randomIndex(choices[selected]!.length)]!;
  });
  const answerSignal = answers.slice(0, 4).reduce<number>((total, answer, index) => total + (answer ?? 0) * (index + 3), 0);
  const bank = WORDS_BY_AGE[ageRange] ?? WORDS_BY_AGE.skip;
  const firstPool = [...new Set([...bank, ...chosenWords])];
  const starterSignal = [...starter].reduce((total, character) => total + character.charCodeAt(0), 0);
  const first = firstPool[(randomIndex(firstPool.length) + starterSignal + round) % firstPool.length]!;
  const second = NOUNS[(randomIndex(NOUNS.length) + answerSignal + round) % NOUNS.length]!;
  const suffix = String(randomIndex(90) + 10);
  let candidate = `${first}${second}${suffix}`.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Keep the result under the username limit without cutting away its random ending.
  if (candidate.length > 20) candidate = `${candidate.slice(0, 18)}${suffix}`;
  return candidate;
}
