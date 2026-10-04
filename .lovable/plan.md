# Candid — Next phase: release polish (messages, back buttons, install page, PWA)

Sprint 4 (Help & Support with FAQs, contacts, ticket form, live chat) is already built and verified, so the next phase is the pre-release polish batch we discussed, confirmed by the user to be built now.

## 1. Messages: true toggle + state memory

Problem today: the top-bar messages icon doesn't actually toggle. When a conversation is open (route `/messages/$id` or the desktop drawer), `messagePanelOpen` is forced true, so tapping the icon does nothing. On mobile, tapping navigates to `/messages` instead of closing. There is no memory of the active conversation or inbox scroll position.

- Tapping the messages icon fully hides/shows messages — inbox or an open conversation — regardless of where the user is.
- Closing messages returns the user to where they were; reopening restores the last active conversation and the inbox scroll position.
- Explicit back from a thread still returns to the inbox (unchanged).
- Implement in `src/components/site/site-shell.tsx` + `src/lib/message-panel-state.ts` (add active-conversation and scroll-memory state; track the return route).
- Mobile `/messages/$id` route keeps working; only the toggle behavior changes.

## 2. Remove misplaced back buttons

- `src/routes/auth.tsx`: remove `FloatingBackButton` entirely. Auth is a standalone full-screen portal — once a user enters, they are out of the app; the only exits are sign-in, sign-up, and guest browsing.
- `src/routes/support.tsx`: remove the desktop-only floating back button; the sticky dynamic header back already covers both mobile and desktop.
- Keep `floating-back-button.tsx` if any other route uses it; otherwise delete it and its import.

## 3. /download install page

- New route `src/routes/download.tsx` with its own head metadata (title, description, og tags).
- Modern full-page layout: Candid branding, "Get Candid on your phone" Android APK button and "Add to desktop (Windows)" instructions for the browser install, plus a note that Google Play / Microsoft Store versions are coming.
- The APK link is a single constant at the top of the file (`APK_URL`) set to a placeholder for now — the user swaps it once they upload the APK (e.g. Netlify public files or GitHub Releases).
- Android-only dismissible install banner: fixed bottom banner above the mobile dock area, "Install the Candid app" with a Download button → `/download`. Dismiss sets a 7-day cooldown in localStorage. Shows only on Android mobile browsers, never inside the Lovable preview.

## 4. PWA basics (manifest-only, no service worker)

- `public/manifest.webmanifest`: name, short_name "Candid", theme/background colors, `display: "standalone"`, icon entries.
- Generate 192px and 512px Candid app icons (flame mark on the brand background) into `public/`.
- Add head tags in `src/routes/__root.tsx`: manifest, theme-color, apple-touch-icon.
- No service worker, no offline caching, no `vite-plugin-pwa` — this only enables home-screen/app-icon install and later PWABuilder packaging for the Microsoft Store.

## 5. Roadmap housekeeping

- Update `roadmap.md`: mark Sprint 4 done, add this release-polish phase.

## Out of scope (unchanged)

- Deployment/publishing fix — user is handling in VS Code with Codex.
- Owner app, monetization UI, real store submissions — future.
- Firebase service-account key rotation — user action.

## Verification

- `bunx tsgo --noEmit` clean.
- Playwright at 411px and 1280px: messages icon toggles open/closed and restores state, auth page has no back button, `/download` renders, Android banner appears on a fake Android UA and respects the 7-day cooldown after dismissal, manifest served.
