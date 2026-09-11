import { useSyncExternalStore } from "react";

export type Preferences = {
  theme: "dark" | "light";
  biometricUnlock: boolean;
  reduceMotion: boolean;
  compactFeed: boolean;
  autoplayInsights: boolean;
};

const KEY = "candid_preferences";
const THEME_KEY = "lo-theme";

const DEFAULTS: Preferences = {
  theme: "dark",
  biometricUnlock: false,
  reduceMotion: false,
  compactFeed: false,
  autoplayInsights: true,
};

let state: Preferences = DEFAULTS;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function read(): Preferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const stored = localStorage.getItem(KEY);
    const parsed = stored ? (JSON.parse(stored) as Partial<Preferences>) : {};
    const theme = (localStorage.getItem(THEME_KEY) as Preferences["theme"] | null) ?? parsed.theme;
    return { ...DEFAULTS, ...parsed, theme: theme === "light" ? "light" : "dark" };
  } catch {
    return DEFAULTS;
  }
}

export function hydratePreferences() {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  state = read();
  applySideEffects(state);
  emit();
}

function applySideEffects(next: Preferences) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", next.theme === "dark");
  document.documentElement.classList.toggle("reduce-motion", next.reduceMotion);
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  state = { ...state, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (key === "theme") localStorage.setItem(THEME_KEY, String(value));
  } catch {
    /* ignore */
  }
  applySideEffects(state);
  emit();
}

export function getPreferences() {
  return state;
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => DEFAULTS,
  );
}
