# Candid feature implementation checklist

This checklist tracks the requested product work. Items marked **Needs decision** are intentionally not being implemented until the product choice is agreed.

## Calls and presence

- [x] Default-deny Realtime Database rules scoped to the existing presence, call-state, room metadata, join-request, and WebRTC signaling paths; dry-run passed and the rules are published.
- [x] Call cleanup runs as a Netlify Scheduled Function, without Firebase Cloud Functions; it expires invitations and requests, handles abandoned members/rooms, removes stale user-call indexes, and deletes ended-room metadata/signals safely.
- [x] One-to-one voice and video calls in a conversation.
- [x] Mute, speaker output selection where the browser supports it, hang up, switch camera, and turn camera off while keeping audio.
- [x] Let a caller request to join an existing call; only the creator can approve or invite, and the requester can cancel before approval.
- [x] Online status dots in conversation rows (RTDB presence is wired in the inbox).

## Profiles and community

- [x] Public/private profile visibility and follow approval.
- [x] Tag suggestions, highlighted mentions, and mention notifications in posts/comments.
- [x] Complimentary Premium for new accounts and a home welcome message.
- [x] Basic and Premium packages only; legacy Gold entitlements map to Premium.
- [x] Shareable profile links and optional mobile sign-up prompt for signed-out visitors.
- [x] Mobile long-press actions for conversations; notifications retain their own actions.
- [x] Full-width Candid posts in feed, with no tick or “Update” label; Candid name and avatar open @candid.
- [x] Three-dot menu on each feed post with report, share, direct follow, and block.
- [x] Reversible “Not interested” options for a single post, an author, or an employer; restore items in Settings.
- [x] Candid-authored posts render edge to edge without a post card or rounded media card.
- [x] Mobile chat uses an immersive, pinned Instagram-style conversation header and composer, with online/last-active status.
- [x] Shared post links open the post directly.
- [x] Industry entry allows a suggested category or custom typed value.
- [x] Company stories remain in the feed; story approval no longer publishes the employer directory listing.
- [x] Move app installation action to the profile drawer, detect installed mode, launch the native prompt directly where supported, and show browser-controlled install status/help.
- [x] Improve generated story descriptions so they read as the contributor’s own draft.
- [x] Keep the post form header/footer fixed while only the active middle section scrolls on mobile.
- [x] Remove the divider above feed engagement controls.
- [x] Leaderboard lists are capped at 10 employers per ranking.

## Account lifecycle

- [x] Deactivation hides profile/search and records permanent deletion after seven days.
- [x] Deletion grace period is 48 hours, with reactivation and a Netlify scheduled Auth + Firestore purge.

## Deployment follow-up

- [x] Publish the validated Realtime Database rules.
- [x] Add Netlify scheduled cleanup for ended/stale calls; client writes to room data remain denied.
- [ ] Deploy both Netlify scheduled functions and confirm their schedules appear on the published Netlify site.
- [ ] Confirm Firebase service-account credentials are available to Netlify Functions at runtime.
- [ ] Set the RTDB URL in production browser-build and server environments, then rebuild/redeploy the app.
- [ ] Configure a production TURN service with short-lived credentials before relying on calls across mobile networks.
