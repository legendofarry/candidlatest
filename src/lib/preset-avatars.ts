export const PRESET_AVATARS = [
  "candid-ember",
  "candid-moss",
  "candid-sky",
  "candid-rose",
  "candid-sun",
  "candid-ocean",
] as const;

export function presetAvatarUrl(id: (typeof PRESET_AVATARS)[number]) {
  return `/avatars/${id}.svg`;
}

export function isPresetAvatarUrl(value: string) {
  return PRESET_AVATARS.some((id) => value === presetAvatarUrl(id));
}
