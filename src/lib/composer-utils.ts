export const QUICK_EMOJIS = ["❤️", "🔥", "😂", "😮", "😢", "👍"] as const;

export function appendEmoji(value: string, emoji: string) {
  return `${value}${value && !/\s$/.test(value) ? " " : ""}${emoji}`;
}
