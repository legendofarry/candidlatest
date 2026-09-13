# Candid — where we are, and what's left

## On the ordering question

The previous assistant was not skipping ahead to easy work. Your own roadmap
document ends with: *"Suggested order: 4 → 7 → 8 → 5 → 6 → 9 → 10 → 11, so
navigation and feed feel right before the heavier messaging work lands."*
That is exactly the order it followed. Nothing was skipped.

## Verified status in this project

Checked against the actual files here, not just the old chat.

| Phase | Topic | State here |
| --- | --- | --- |
| 1-3 | Usernames, verification badge, comment threads, reporting | Present |
| 4 | Likes, follows, followed stories, AI catch-up | Present |
| 7 | Navigation restructure, back bar, footer rules | Present |
| 8 | Feed and directory filter bar | Present |
| 5 | Notifications overlay, toast/inbox split, expiry | Present |
| 6 | Messaging, chat, privacy settings | Present |
| 9 | Company intelligence | **Not built** |
| 10 | Salaries directory | **Not built** |
| 11 | Polish and account-type nudges | **Not built** |

The migration into this project also carried the whole app across, restored
your real Firebase accounts and stories, and left two loose ends: the service
account key that was shared in chat still needs rotating, and the feed has a
small hydration warning.

## Remaining work

### Phase 9 — Company intelligence
- Rating a company only from its detail screen, behind a short tap-only
  questionnaire (no free typing) that saves the rating plus the reasons.
- "Me too", "% would work here" and the red-flag breakdown become
  user-contributed and interactive everywhere they appear.
- Company accounts get a location prompt (auto-pin or paste a map link); a
  story's location tag opens a full-screen map and is hidden when the company
  has no location.

### Phase 10 — Salaries directory
- Company-first listing; today the screen is one flat table of every report.
- Opening a company reveals a paginated, sortable breakdown by position with
  average pay and contributor counts.
- Typical ranges only appear once enough contributions exist.
- Contributing requires picking a company from the in-app list, no free text.

### Phase 11 — Polish and account-type nudges
- Candid Pulse redesigned with a stated purpose and live animated data.
- Richer About screen with an owner-updatable "how to reach us" block.
- Sign-out asks once whether to remember the session for next launch.
- If an account still can't be classified past the expected window, prompt the
  user with questions or a support path.

### Loose ends
- Rotate the Firebase service-account key (it was shared in chat).
- Fix the hydration warning on the feed.

## Technical notes

- New Firestore collections for the remaining phases:
  `company_locations`, `company_rating_answers`; salary aggregation reads
  existing `salary_reports` grouped by company then position.
- All server work stays in `createServerFn` modules with Firestore access
  behind `*.server.ts` helpers, matching the existing
  `actions.functions.ts` / `firebase-data.server.ts` split.
- Company rating writes go through a new `company.functions.ts` guarded by
  `requireFirebaseAuth`; one rating per user per company.
- Salaries splits into a directory route and a company detail table, reusing
  the existing `filter-bar` component for consistency.
- Map modal loads its map library only after hydration so server rendering
  stays intact.

## Suggested next step

Start Phase 9, then 10, then 11, keeping the original roadmap order.
