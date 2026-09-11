# Fully migrate Candid from GitHub

## Goal
Recreate the GitHub project in this Lovable project so its existing public pages, account flows, interactions, data behavior, and visual identity run here.

## What will be migrated
- Replace the blank starter with the complete Candid application and all detected routes: feed, companies, company details, stories, search, salaries, leaderboards, posting, profiles, onboarding, messages, notifications, authentication, and informational/legal pages.
- Preserve the responsive Candid interface: dark-first lime/teal/red palette, Outfit and Figtree typography, desktop header, mobile tab bar, splash screen, loading states, animations, cards, filters, dialogs, and accessibility behavior.
- Preserve the existing Firebase email/password and Google sign-in so current users retain their identities.
- Preserve Firestore-backed stories, profiles, companies, comments, votes, ratings, salary reports, follows, messaging, verification, reports, and owner audit data.
- Preserve AI story screening, company research, and story-activity summaries through the existing OpenRouter integration and safe fallback behavior.
- Preserve the authenticated owner API endpoints for users, stories, companies, reports, and statistics.

## Implementation approach
1. Create the migration ledger covering code, routes, Firebase identities, Firestore collections, records, AI, owner APIs, secrets, and verification.
2. Port the complete source tree while keeping this project's TanStack Start runtime conventions and compatible pinned framework setup.
3. Restore all required packages and check browser/server boundaries, especially Firebase Admin usage in the hosted runtime.
4. Securely configure the existing Firebase project credentials, browser configuration, OpenRouter key, and owner API key. No secrets will be placed in source code or requested in chat.
5. Preserve the original metadata for each page and repair any missing route-specific social metadata required by this project.
6. Validate compilation, all major public routes, mobile and desktop layouts, navigation, forms, empty/error states, and browser console/network behavior.
7. Verify a real Firebase sign-in, one protected server request, and representative create/read/update/delete behavior when credentials and existing data are available.

## Data and account continuity
- The repository contains collection definitions and data access logic, but no exported Firestore records or Firebase user export.
- Existing Firebase accounts will remain the authentication source; no account-provider replacement is planned.
- After the app preview is restored, existing Firestore data will appear automatically once the original Firebase credentials are connected. If the original project cannot be connected directly, a Firestore export will be needed for record migration.

## Completion criteria
- Every detected page opens without placeholder content.
- Public browsing, filtering, company/story views, and static information pages work.
- Existing users can sign in and authenticated actions reach Firebase securely.
- Posting, voting, comments, reports, ratings, salaries, follows, messaging, verification, and owner endpoints preserve their source behavior.
- AI-assisted features work when the OpenRouter key is connected and degrade safely when unavailable.
- The app passes automated checks and visual verification at phone and desktop sizes.

## Expected handoff
The code and preview can be migrated first. Live account, data, AI, and owner-endpoint verification will require the source project's credentials through Lovable's secure secret flow; existing records are not bundled in the repository.
