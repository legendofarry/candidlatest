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

- [ ] Redesign the private profile screen to match the Lovable reference's background, typography, spacing, and full-width section layout; keep the cover, overlapping avatar, and existing profile actions. This visual fix is deferred for a later pass.
- [x] Public/private profile visibility and follow approval.
- [x] Tag suggestions, highlighted mentions, and mention notifications in posts/comments.
- [x] New regular accounts default to the Free package; only the official Candid account has complimentary Premium.
- [x] Basic and Premium packages only; legacy Gold entitlements map to Premium.
- [x] Package limits are enforced on the server for salary reports, new chats, and AI story catch-ups; Free is 3 salary reports/month, 3 new conversations/day, and 1 catch-up/day. Premium is 20/month, 20/day, and 10/day.
- [x] Free compares up to 2 employers and sees 5 leaderboard entries; Premium compares up to 5 and sees 10.
- [x] Full notifications, reactions, account safety/privacy controls, support access, and contribution management stay Free. Premium does not lock other users' public profiles or posts.
- [x] Premium story pins are capped at 3; paying does not grant an identity-verification badge or boost ranking.
- [x] Shareable profile links and optional mobile sign-up prompt for signed-out visitors.
- [x] Mobile long-press actions for conversations; notifications retain their own actions.
- [x] Social notifications show the actor's handle and avatar for follows, follow requests, post/comment activity, mentions, and message reactions; system notices keep generic icons.
- [x] Notifications can be filtered by unread state and activity type; mobile filters open in a slide-up sheet.
- [x] Full-width Candid posts in feed, with no tick or “Update” label; Candid name and avatar open @candid.
- [x] Three-dot menu on each feed post with report, share, direct follow, and block.
- [x] Follow menus and public profiles reflect follow-back, unfollow, pending-request, block, and unblock states.
- [x] Blocking hides both accounts from one another's profile, feed, and search; removes mutual follows and pair interactions; keeps existing chats but makes new messages sender-only and marked not delivered.
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
- [x] Leaderboard lists show 5 entries to Free users and 10 to Premium users.
- [x] Story details and mobile comment sheets use one clean, full-width comment surface: no stacked frames, duplicate empty-state copy, or redundant composer divider.
- [x] Story comment threads display replies as flat, unindented rows, collapsed by default behind a reply toggle; each revealed reply shows its parent handle inline.
- [x] Story composer location selection is grouped progressively: choose a county, then choose an area or type a custom one; the contributor identity avatar toggles public/anonymous mode for each story and comment.
- [x] Story voting acts immediately with icon-only active states; reporting is available from the post menu instead of competing with engagement controls.
- [x] Suppress routine success banners when the updated UI already confirms the result (feed preferences, follows/blocks, conversation preferences, privacy changes, pins, edits, and removals); errors and meaningful completion feedback remain visible.

## Account lifecycle

- [x] Add a user-controlled mention audience (everyone, followers, or nobody); keep tagging available on every package and enforce notification privacy on the server.
- [x] Add personal message themes. The viewer's theme applies to their inbox and conversations only; Free has Candid and Midnight, while Premium unlocks Forest, Ocean, and Sunset.
- [x] Add opt-in anonymity for new workplace stories and comments, with a per-contribution choice and a saved default. Existing contributions are unchanged; ownership stays private in storage for moderation and author management; public profile counts and story lists omit anonymous contributions.
- [x] Add a self-service JSON account export for every member, including profile, authored contributions, reactions/saves/follows, notifications, and conversations. Exclude credentials, employment proof, internal moderation data, and other members' private profile information.

- [x] Deactivation hides profile/search and records permanent deletion after seven days.
- [x] Deletion grace period is 48 hours, with reactivation and a Netlify scheduled Auth + Firestore purge.

## Deployment follow-up

- [x] Publish the validated Realtime Database rules.
- [x] Add Netlify scheduled cleanup for ended/stale calls; client writes to room data remain denied.
- [ ] Deploy both Netlify scheduled functions and confirm their schedules appear on the published Netlify site.
- [ ] Confirm Firebase service-account credentials are available to Netlify Functions at runtime.
- [ ] Set the RTDB URL in production browser-build and server environments, then rebuild/redeploy the app.
- [ ] Configure a production TURN service with short-lived credentials before relying on calls across mobile networks.
