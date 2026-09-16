# Candid — mobile feed and salary fixes

## What will change

### Feed action row
- Rework the upvote, “me too”, comments, like, bookmark, and report controls into a stable mobile layout.
- Give every icon a consistent tap target and enough space so inactive controls remain clear rather than looking squeezed or unavailable.
- Keep selected states visually distinct without letting labels or counts push other controls off the card.

### Salary honesty on mobile
- Make the salary page and employer rows fit the phone viewport without horizontal overflow.
- Allow long employer details and “Not enough data” to wrap or truncate within their own space.
- Keep the amount/status and arrow visible without forcing the page wider than the screen.

### Story usernames
- Verify the affected story records against their author profiles.
- Preserve the existing public behavior: show `@username` whenever the story has an author whose profile has a username, regardless of whether the viewer is signed in.
- Keep “Anonymous” only for genuinely anonymous or legacy stories with no matching username; repair migrated record links if the affected stories should have authors.

### Stability
- Fix the current Candid Pulse server/client mismatch by giving its first render the same data shape on both sides.
- Recheck the feed and salary pages at the current phone width and on desktop, including signed-out viewing.

## Technical notes
- Keep action controls accessible with clear labels and minimum touch areas.
- Constrain flex children with shrink/min-width rules rather than hiding salary information.
- Resolve usernames through the existing story-author/profile relationship; no viewer login dependency will be introduced.