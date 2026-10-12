# Friends timeline

The signed-in home page shows the latest 15 entries from accepted friends, newest first, and a **Show more** button loads the next 15 below them. Guests still go to search. **My library** lives at `/library`, under the account icon; the wordmark returns to the timeline.

This is a view of current activity, not a permanent history. It reads the existing library, currently playing, completed, game-rating, game-favorite, Xbox achievement, and challenge records when the page loads. There is no activity table, queue, push delivery, friendship announcement, or unread marker in the timeline.

## What belongs in the timeline

Every new feature that fits this methodology must add a timeline entry in the same change, with its section below. A feature fits when a player adds, chooses, starts, or finishes something that a friend would notice, and the current record stores a timestamp for that moment. The entry is computed from that record on read, respects the friendship and verified-account rules below, and disappears when the record is removed. Reordering, editing details, and repeating an action do not bump it. Settings, profile edits, friendships, reorderings, and [direct messages](architecture.md#messages) (private between two players) do not belong in the timeline.

## Library batches

Group saved platform copies separately for each friend. Start with their newest ungrouped addition and include every addition from the preceding 24 hours, including the exact boundary. Repeat with the next ungrouped addition. The window is anchored to the newest item, not extended by every subsequent item and not tied to calendar days.

For example, additions Monday at 18:00, Monday at 09:00, and Sunday at 19:00 form one batch; Sunday at 17:00 starts the next. Different players never share a batch. A game saved on two platforms counts as two copies, with each platform shown. A batch takes one timeline slot regardless of how many games it contains. The first four covers and titles are visible. **Show more** reveals up to 12 additional copies per click, up to 100 in the timeline. **Show fewer** returns to the first four. When a batch contains more than 100 copies, the bottom control at 100 links directly to the player’s Library section to see the remainder. The heading counts the entire batch; the server sends details for only its newest 100 copies. Keyboard focus moves to the first newly revealed game, or the first game when collapsing. Select a game name to open its details and add it to your own library. Each game has a compact **+ Add challenge** action at the end of its existing row. It opens the same challenge form as the friend's library card and creates a challenge for that friend and game; it does not change the batch grid or cover size.

Steam imports enter these same batches at the time new RGBoner copies are created, not a guessed Steam purchase date. Linking an existing copy preserves its timestamp and produces no new entry. Steam refreshes, mapping choices, exclusions, and recent-play snapshots do not change the manual currently-playing mark or add timeline entries.

A batch uses its newest addition's `added_at` for ordering. Platform edits do not bump it. Deleted copies disappear on the next page load, and batches are recalculated from the remaining rows. New additions can regroup earlier entries; that is intentional for this current-state view.

## Challenges

Each challenge appears once, including challenges between two friends or between a friend and the viewer. Open a challenge's cover or title to see the shared profile detail popup, including its description and participant links. Current confirmation flags determine its status:

- Recipient has not confirmed: **Challenge pending**.
- Recipient alone has confirmed: **[Player] marked it complete**.
- Both have confirmed: **Challenge completed**.

The creator confirming alone does not change the displayed state or ordering. Either participant can still undo their own confirmation; the status then reflects the current flags. The participant byline identifies who challenged whom, while the timestamp says **Updated** after a state change so an undo cannot be mistaken for a newly issued challenge.

`timeline_at` is initialized to `created_at` for new challenges. Confirmation writes conditionally update it in the same SQL statement, using the stored flags so concurrent confirmations cannot leave an incorrect timestamp. Repeated confirmations, favorites, and manual ranking do not bump it. Legacy declined challenges are omitted. Deleted challenges disappear; removing a library copy does not delete its independent challenges.

Migration `0008_steady_paladin.sql` leaves existing challenges with a null `timeline_at`. They enter the timeline only after a new visible state change. Historical completion dates are not invented.

## Visibility and ordering

All eligibility is checked on the server. Library additions require an accepted friendship. Challenges require at least one accepted friend; both participants must be visible to the viewer (the viewer themselves, an accepted friend, or a public profile). Both participants must have verified email accounts. A public stranger's activity alone never enters the feed. Private non-friend participants hide the entire challenge for regular players. Admins bypass this participant privacy restriction, while the feed still requires an actual accepted friend and verified participants.

Current friendship and account visibility are rechecked on each read. Pending requests grant no access to regular players; admin profile access is independent of friendship. Removing a friendship can remove activity. A private profile remains visible to accepted friends. Challenge IDs prevent duplication when both participants are friends.

After grouping, merge library batches, rating batches, Xbox achievement batches and completions, currently playing and completed entries, game favorites, and challenges, sort by timestamp descending with a stable type/entry-key tie-breaker, and take one page of 15.

## Pages

Each page reads only what it needs, starting from the viewer's accepted friends through per-player indexes rather than scanning everyone's activity, and sends all eight reads to D1 in one batch. Challenges, favorites, currently playing, completed entries, and Xbox completions are read newest first, 16 at a time. Library additions, ratings, and Xbox unlocks are read newest first, 100 rows at a time, but never shown incomplete: a batch is complete only once its whole 24-hour window has been read, so entries are kept only if they are newer than every source's cut-off (the oldest single entry read, or the oldest batched row plus 24 hours). If fewer than a page's entries are certain, all limits grow fourfold and the page is read again, so a large import still appears as one batch with an exact total count. Only its newest 100 library copies are serialized; the cursor skips the entire batch window, including copies beyond that cap.

The server returns an opaque `next` cursor with each page, and `GET /api/timeline?cursor=…` returns the next one. The cursor holds the last entry's timestamp and key, plus, for each friend whose library or rating batch was shown within the last 24 hours before it, the start of that batch's window. The next page reads only rows at or before the cursor and, for those friends, strictly before their window start, so every friend's next batch starts from their newest ungrouped row, exactly as if the whole feed had been read at once. Pages are computed from current records, so activity added or removed between clicks can shift entries; the client skips keys it already shows.

## Presentation

A dark, square monitor-like frame, a small RGB accent, and restrained monospaced labels evoke a clean CRT/PVM RGB signal. Covers retain their proportions and normal image rendering. Game names open the full game details dialog with controls for adding or removing platform copies from the viewer's library. The green **+ Add challenge** action sits at the end of each game row on desktop and below its title on narrow screens to leave room for readable names. Challenge covers and titles open the shared challenge detail popup, including the description; the separate profile link is omitted. The initial four covers per library batch reuse the profile’s cached IGDB recovery for missing legacy artwork and save what it finds to the library row, so each copy is looked up once. The page waits at most 1.5 seconds for that lookup; slower or unavailable covers use a quiet fallback and are still saved for the next load. Expanded entries use stored artwork. Text, focus outlines, and state labels stay clear; there are no scanlines, flicker, glow, or distortion. Empty and error states provide useful next steps. See [the style guide](style-guide.md).

Implementation: `lib/timeline-queries.ts` holds the visibility rules and bounded reads as SQL; `lib/timeline.ts` batches them and recovers covers; `lib/timeline-items.ts` handles batching, final ordering, page completeness, and the cursor; `app/api/timeline/route.ts` serves later pages; `app/timeline.tsx` renders the feed and appends pages. The home page handles read failures without presenting an empty feed as a successful load. A failed **Show more** keeps the loaded entries and shows the error above the button. After a page loads, focus moves to the first new entry's player link; once no pages remain, the button gives way to the caught-up note.

## Currently playing

Each platform copy a verified accepted friend marks as currently playing contributes its own entry: “[Player] started playing”, with the cover, a clickable title, and the platform. The same game on two platforms produces two entries. `playing_since` determines ordering; repeating the mark or changing the copy's platform does not bump it. Unmarking or removing the copy removes its entry, and marking it again creates a fresh timestamp. These entries are separate from library batches: marking a copy does not change the batch it was added in. They share the page size and friendship visibility rules with library additions, and the viewer's own games are excluded.

## Game favorites

Each current game favorite by a verified accepted friend contributes one entry: “[Player] favorited a game”, with its cover and clickable title. Favorites are independent of library platform copies. `favorited_at` determines ordering; moving a favorite or repeating an add does not bump it. Removing a favorite removes its entry; adding it again creates a fresh timestamp. Favorites share the same page size and friendship visibility rules as library additions. Public strangers and the viewer's own favorites do not enter the friend feed.

## Completed games

Each platform copy a verified accepted friend marks completed contributes its own entry: “[Player] completed a game”, with the cover, a clickable title, and the platform, like a currently playing entry. `completed_at` determines ordering; repeating the mark does not bump it. Completing a copy does not remove it from Currently playing, and the two entries are independent. Clearing the mark or removing the copy removes the entry; marking it again creates a fresh timestamp. The viewer's own games are excluded.

## Game ratings

Scores from a verified accepted friend are batched per friend exactly like library additions: the newest ungrouped rating starts a batch holding every rating from the preceding 24 hours. The entry reads “[Player] rated a game” or “rated N games” and shows four covers with titles and read-only stars, with the rest behind the same disclosure. `rated_at` is the first time the player scored the game; changing the score shows the new score without bumping the entry. Clearing the score removes it, and rating again creates a fresh timestamp. Ratings are independent of library copies, so a friend can rate a game they do not own.

## Xbox achievements

Achievements appear only for Xbox games a verified accepted friend added to their library, and disappear when that copy is removed or Xbox is disconnected.

- **Unlocks** are batched per friend **and game** like library additions: the newest ungrouped unlock starts an entry holding every unlock of that game from the preceding 24 hours. The entry reads “[Player] unlocked N achievements”, with the cover, a clickable title, and the first three achievement names. Each unlock keeps the time Xbox reports, so a first sync of an older game places its entries at their real dates rather than at the top of the feed. Rereading a list never changes those times. Cursor floors for these batches are keyed by friend and game.
- **Every achievement earned** contributes one entry per game, “[Player] earned every achievement”, timed by the final unlock. A later add-on with new achievements hides it until those are earned too; it then returns with the new final unlock time.

The viewer's own achievements are excluded. Implementation: `timelineAchievementsQuery` and `timelineMasteredQuery` in `lib/timeline-queries.ts`, and `batchAchievements` in `lib/timeline-items.ts`.
