import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact public-facing counts while retaining exact totals for assistive tech. */
export function formatCount(value: number | null | undefined) {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count)) return "0";
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(Math.max(0, count))
    .replace("K", "k")
    .replace("M", "m")
    .replace("B", "b");
}
