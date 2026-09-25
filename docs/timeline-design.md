# Friends timeline

The signed-in home page shows the latest 30 entries from accepted friends, newest first. Guests still go to search. **My library** lives at `/library`, under the account icon; the wordmark returns to the timeline.

This is a view of current activity, not a permanent history. It reads the existing library and challenge records when the page loads. There is no activity table, queue, push delivery, pagination, notification system, friendship announcement, or unread marker.

## Library batches

Group saved platform copies separately for each friend. Start with their newest ungrouped addition and include every addition from the preceding 24 hours, including the exact boundary. Repeat with the next ungrouped addition. The window is anchored to the newest item, not extended by every subsequent item and not tied to calendar days.

For example, additions Monday at 18:00, Monday at 09:00, and Sunday at 19:00 form one batch; Sunday at 17:00 starts the next. Different players never share a batch. A game saved on two platforms counts as two copies, with each platform shown. A batch takes one of the 30 timeline slots regardless of how many games it contains. The first four covers and titles are visible; the rest expand in place.

A batch uses its newest addition's `added_at` for ordering. Platform edits do not bump it. Deleted copies disappear on the next page load, and batches are recalculated from the remaining rows. New additions can regroup earlier entries; that is intentional for this current-state view.

## Challenges

Each challenge appears once, including challenges between two friends or between a friend and the viewer. Current confirmation flags determine its status:

- Recipient has not confirmed: **Challenge pending**.
- Recipient alone has confirmed: **[Player] marked it complete**.
- Both have confirmed: **Challenge completed**.

The creator confirming alone does not change the displayed state or ordering. Either participant can still undo their own confirmation; the status then reflects the current flags. The participant byline identifies who challenged whom, while the timestamp says **Updated** after a state change so an undo cannot be mistaken for a newly issued challenge.

`timeline_at` is initialized to `created_at` for new challenges. Confirmation writes conditionally update it in the same SQL statement, using the stored flags so concurrent confirmations cannot leave an incorrect timestamp. Repeated confirmations, favorites, and manual ranking do not bump it. Legacy declined challenges are omitted. Deleted challenges disappear; removing a library copy does not delete its independent challenges.

Migration `0008_steady_paladin.sql` leaves existing challenges with a null `timeline_at`. They enter the timeline only after a new visible state change. Historical completion dates are not invented.

## Visibility and ordering

All eligibility is checked on the server. Library additions require an accepted friendship. Challenges require at least one accepted friend; both participants must be visible to the viewer (the viewer themselves, an accepted friend, or a public profile). Both participants must have verified email accounts. A public stranger's activity alone never enters the feed. Private non-friend participants hide the entire challenge.

Current friendship and account visibility are rechecked on each read. Pending requests grant no access. Removing a friendship can remove activity. A private profile remains visible to accepted friends. Challenge IDs prevent duplication when both participants are friends.

After grouping, merge library batches and challenges, sort by timestamp descending with a stable type/ID tie-breaker, and take 30. The initial implementation reads eligible current records directly; revisit query limits or indexing only if measured usage warrants it. Do not truncate library rows before grouping, which would split large imports or produce incomplete batches.

## Presentation

A dark, square monitor-like frame, a small RGB accent, and restrained monospaced labels evoke a clean CRT/PVM RGB signal. Covers retain their proportions and normal image rendering. The initial four covers per library batch reuse the profile’s cached IGDB recovery for missing legacy artwork; unavailable covers use a quiet fallback. Expanded entries use stored artwork. Text, focus outlines, and state labels stay clear; there are no scanlines, flicker, glow, or distortion. Empty and error states provide useful next steps. See [the style guide](style-guide.md).

Implementation: `lib/timeline.ts` handles visibility and reads; `lib/timeline-items.ts` handles batching and final ordering; `app/timeline.tsx` renders the feed. The home page handles read failures without presenting an empty feed as a successful load.
