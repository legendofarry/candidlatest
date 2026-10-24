type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let pendingPrompt: InstallPromptEvent | null = null;
const INSTALLED_KEY = "candid-pwa-installed";

export type InstallProgress = "opening" | "accepted" | "dismissed" | "unavailable" | "installed";

export function isPwaInstalled() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)) return true;
  try { return window.localStorage.getItem(INSTALLED_KEY) === "true"; }
  catch { return false; }
}

export function markPwaInstalled() {
  try { window.localStorage.setItem(INSTALLED_KEY, "true"); }
  catch { /* standalone display mode remains available */ }
}

function reportProgress(state: InstallProgress) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("candid:pwa-install-progress", { detail: state }));
  }
}

export function rememberInstallPrompt(event: Event) {
  pendingPrompt = event as InstallPromptEvent;
}

/** The browser only exposes installation from a user gesture and its native prompt. */
export async function requestPwaInstall(): Promise<InstallProgress> {
  if (isPwaInstalled()) {
    reportProgress("installed");
    return "installed";
  }
  if (!pendingPrompt) {
    reportProgress("unavailable");
    return "unavailable";
  }
  const event = pendingPrompt;
  pendingPrompt = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("candid:pwa-prompt-consumed"));
  reportProgress("opening");
  try {
    await event.prompt();
    const choice = await event.userChoice;
    reportProgress(choice.outcome);
    return choice.outcome;
  } catch (error) {
    reportProgress("unavailable");
    throw error;
  }
}
