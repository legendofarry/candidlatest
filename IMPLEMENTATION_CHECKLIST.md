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
- [x] Social notifications show the actor's handle and avatar for follows, follow requests, post/comment activity, mentions, and message reactions; system notices keep generic icons.
- [x] Notifications can be filtered by unread state and activity type; mobile filters open in a slide-up sheet.
- [x] Full-width Candid posts in feed, with no tick or “Update” label; Candid name and avatar open @candid.
- [x] Three-dot menu on each feed post with report, share, direct follow, and block.
- [x] Follow menus and public profiles reflect follow-back, unfollow, pending-request, block, and unblock states.
- [x] Mobile feed-post options open in a slide-up action sheet.
- [x] Reversible “Not interested” options for a single post, an author, or an employer; restore items in Settings.
- [x] Candid-authored posts render edge to edge without a post card or rounded media card.
- [x] Candid post media spans the full width of its story-detail pane.
- [x] Story details show the post and comments together in a resizable split layout.
- [x] Company ratings and salary submissions require a company story or an AI-assessed comment/reply that clearly describes the author's own work experience; assessments are cached against the exact comment text, and server functions enforce the rule.
- [x] Feed post actions update optimistically, allow independent actions without waiting for another action to finish, and show the signed-in user's vote, like, save, and follow state.
- [x] Membership is reached through a compact gem icon instead of a settings membership panel.
- [x] Mobile chat uses an immersive, pinned Instagram-style conversation header and composer, with online/last-active status.
- [x] Shared post links open the post directly.
- [x] Industry entry allows a suggested category or custom typed value.
- [x] Company stories remain in the feed; story approval no longer publishes the employer directory listing.
- [x] Move app installation action to the profile drawer, detect installed mode, launch the native prompt directly where supported, and show browser-controlled install status/help.
- [x] Improve generated story descriptions so they read as the contributor’s own draft.
- [x] Keep the post form header/footer fixed while only the active middle section scrolls on mobile.
- [x] Remove the divider above feed engagement controls.
- [x] Leaderboard lists are capped at 10 employers per ranking.
- [x] Story details and mobile comment sheets use one clean, full-width comment surface: no stacked frames, duplicate empty-state copy, or redundant composer divider.
- [x] Story voting acts immediately with icon-only active states; reporting is available from the post menu instead of competing with engagement controls.
- [x] Suppress routine success banners when the updated UI already confirms the result (feed preferences, follows/blocks, conversation preferences, privacy changes, pins, edits, and removals); errors and meaningful completion feedback remain visible.

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
