# Candid — Next Features Plan

Four sprints, in the order we discussed. The owner-app side (support ticket viewer, live-chat queue, AI approval mode) is built by you separately — this plan covers only the user app.

## Sprint 1 — Post Story flow upgrade + optional employment verification

Goal: easier language, custom reasons, position capture, duplicate-company protection, and a private optional verification layer in step 5.

### Step 1 — Employer
- Rename labels to plain language: "Who was your employer?" / "Employer or business name", helper text "The shop, company, or person you worked for — e.g. Sky Minimart, Naivas, boda stage."
- Employer input becomes an autocomplete dropdown against the existing company list (replacing the current `datalist` with a proper dropdown).
- Duplicate detection: normalize names (lowercase, strip "ltd", "kenya", "enterprises", "shop", punctuation, extra spaces) and match against company names plus a new `aliases: string[]` field on companies. If a close match exists, show an inline banner: "Did you mean **Juma Electronics**? Tap to select." If none, offer "Can't find your employer? Add it" — the community-created company grows the directory.
- Industry and County stay as chips (unchanged behaviour, plainer labels).

### Step 2 — Reasons
- Keep the preset reason chips.
- Add an input: "Or type your own reason and press Enter or comma." Typing text then `,` or Enter converts it into a removable custom tag. Custom tags submit alongside preset reasons.

### Step 3 — Your role
- Add a **Job title / Position** input (e.g. Cashier, Graphic Designer, Rider) alongside tenure and role level.
- This feeds the salary directory's per-position grouping so averages stop mixing different roles. The salary contribute form already captures role title; the story position gives context and future linking.

### Step 4 — Your story
- Unchanged.

### Step 5 — Anonymity + optional private verification
- Keep the current publish consent content.
- Add an optional, collapsed "Prove you worked there (optional, private)" section:
  - Accept: staff ID, contract/exit letter, work email, M-Pesa statement screenshot or transaction message, or other evidence (image/PDF upload).
  - Copy explains: evidence is never published, never shown to the employer, only reviewed by moderators.
  - Kenyan small-business note: "Paid via M-Pesa from your boss's personal number? That's fine — add a short note telling us."
- Submission stores evidence privately (Firestore `employment_evidence` + storage), marks the story internally as "evidence submitted" (pending review) vs "community story". No public "verified employee" badge. Suspicious/risky stories still route to admin review instead of auto-publish (existing screening already does the review routing; this adds the evidence signal).

## Sprint 2 — Mobile comment bottom sheet + confirmation modals

- Feed card comment button: on mobile (< 768px) opens a bottom sheet with the comment thread and sticky input bar, drag-down to dismiss. Desktop behaviour unchanged (navigates to story page).
- Add a reusable confirm dialog and wire it to: delete story, delete comment, discard an in-progress post draft (Back/leave with content), report story/comment/user, clear all notifications, archive all notifications.

## Sprint 3 — Mentions + notification archive

### Mentions / tagging
- Comments and replies: typing `@` shows an autocomplete of handles active in the thread; inserting `@username`.
- On submit, parse mentions and notify each tagged user: "@user mentioned you in a comment on [story title]".
- Notification deep-links to `/stories/$id?comment=<id>`; the story page scrolls to that comment and auto-expands collapsed ancestor replies so the tagged comment is visible.
- Post tagging: when a story goes live and its employer company is claimed by a company account, send that account a notification "Your company was mentioned in a new story", linking to the story.

### Notification archive
- Add `archived: boolean` to notification records.
- Notifications overlay gets Inbox / Archive tabs; per-item and bulk "Archive" / "Unarchive" actions. Archived items are excluded from the unread count and the 7-day sweep keeps working on the inbox.

## Sprint 4 — Help & Support screen + live chat

- New `/support` route (linked in the shell navigation and footer):
  - Modern FAQ accordion covering anonymity, how stories are screened, employment evidence, right of reply, employer claiming, data/privacy rights (ODPC correction & deletion).
  - Contact cards: Email moderation.mails.go@gmail.com, WhatsApp +254 715 198636 (tap opens pre-filled chat).
  - Support form: full name, contact (email or phone), category, message → saved to Firestore `support_tickets` for the owner app to read.
  - Live chat: floating chat widget; messages stored in Firestore `support_conversations` / `support_messages` so the owner app (with its AI) can pick them up. User side shows "We usually reply within a day" expectations.
- Polished, modern UI consistent with the existing Candid design system (no new color tokens; semantic tokens only).

## Technical notes

- New Firestore collections: `employment_evidence`, `support_tickets`, `support_conversations`, `support_messages`; `aliases` and `claimed_by` fields on `companies`; `position` on stories; `archived` on notifications.
- Server logic via `createServerFn` modules; Firestore access through `*.server.ts` files; public reads get Firebase-unavailable fallbacks.
- Evidence uploads go to Firebase Storage with access restricted to moderators (never public URLs).
- Company matching runs server-side in `findOrCreateCompany` (extend it to return match suggestions instead of silently creating).
- Every new route gets its own head() metadata; `/support` gets unique title/description.
- Verify each sprint: `bunx tsgo --noEmit` plus Playwright checks at 411px (mobile) and 1280px (desktop).

## Out of scope (yours, in the owner app)

- Support ticket inbox, live-chat queue UI, and the AI approval/drafting mode.
- Admin merge UI for duplicate companies (this plan only detects and suggests; merging stays manual for now).

## Loose ends carried over

- Rotate the Firebase service-account key shared in chat earlier (your action).
- Publishing the app when you're ready.
