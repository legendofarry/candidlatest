export function showSplashScreen() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("candid:show-splash"));
}
