# Events

Events, such as **Backlog Season**, count the games players play between a first and last day. Each player ends with a list of the games they played during the event, how long, and what they beat or completed, and the event ranks everyone on a leaderboard. This file holds the rules and the decisions behind them; [architecture](architecture.md#events) points here, and the [style guide](style-guide.md) describes the screens.

## Principles

- **Every event is about playing games.** All events count games played, hours played, beaten, and completed (100%). Any later kind of event adds to this, never replaces it.
- **Fill in what the site knows; let people fix the rest.** Connected libraries and the library propose event data; players review and accept it. Players and hosts can correct any of it, for the event only.
- **Event results stay independent.** Accepting a connected game outside the library also adds or links its platform copy through the service’s normal import. Event hours, beaten, and 100% choices never overwrite library hours or completion marks. Manual event hours contribute to the displayed library total; provider-reported event hours are already included in lifetime totals. A host marking a game "not beaten" changes only the event.
- **No events in the timeline.** Joining, invitations, updates, edits, scores, and standings never appear in the friends timeline. A game beaten during an event shows up only because the library or connected service recorded it, exactly as without the event, and the timeline never mentions the event.
- **Keep it simple.** One page per event, and advanced settings stay closed until a host asks for them. Games appear as compact rows with always-visible Hours, Beaten, and 100% fields when editable; checkboxes save on click and hours save when leaving the field or pressing Enter. Routine saves update the fields and totals without a Saved banner; errors remain visible. There are no Save or reset buttons or edit labels; points stay on one line and removal sits beside the row.

Game multipliers store the catalog name and cover when first added and when updated.

## People

- An event has an **owner** and optional co-managers called **hosts** (never "admins", so they are not confused with the hidden site admin role). Hosts can change anything in the event, including any player's results. The owner cannot be removed. Site admins have every host permission on every event, through `hasPermission`.
- **Creating and copying events is limited to site admins for now** (`hasPermission(user, false)` in `createEvent` and `copyEventFor`). Opening it to every player later means passing `true`; hosts can already add hosts and invite only their accepted friends (site admins can choose any verified player).
- Events are **public** (any signed-in player can join) or **private** (only invited players can see or join, plus hosts). Guests never see events.
- Invited players must **accept** on the event page; invitations show only in the Invitations section of `/events`, with no badge or email. Hosts can join their own private events.
- Players can join a public event at any time before it ends. **Leaving keeps the player's data**; rejoining restores it. While out, they are hidden from the standings.
- A **private-profile player joining a public event** agrees to show their event games there. The join panel tells them so; only they see the note.

## Dates and locking

- Events run in **whole days**: from midnight starting the first day to midnight ending the last, in the owner's time zone (`eventWindow` in `lib/event-rules.ts`, which handles daylight saving changes). The days and the time zone are stored with the computed `starts_at` and `ends_at`.
- Status is upcoming, live, or ended. **Results lock at the end of the last day**: players can no longer update, add, edit, or remove games, and only hosts and site admins can change results afterwards. Until then, players can edit their own results freely, including undoing a host's change, because a game marked not beaten might be beaten later.

## Playtime

Connected services report playtime as a running total with no dates, so event time is always a difference between two readings.

- **Baseline.** The first time a joined player opens the event after it starts (or joins while it runs), RGBoner refreshes their connected services and saves every source game's total (`event_members.baseline_json`, keyed `steam:<app>`, `xbox:<title>`, `psn:<key>`, `ra:<game>`). It includes games not yet matched or added to the library. The join panel says time counts from that first visit; time played between the start and that visit is not counted unless the player adds it by hand.
- **Update reviews changes.** It refreshes the player's connected services again (each within its own five-minute limit, then one batch of achievement or trophy reads) and builds a review directly below the Update controls, including connected games not in the library. Event results and standings do not change until acceptance. Recently played games with missing playtime can still be accepted, then filled in by hand; the review says **Time not reported**. Each card shows event hours for a new game, or previous → proposed hours and the difference for an existing game, plus beaten, 100%, and achievement/trophy changes. **Accept** saves one game; **Accept all** saves the matched games in bounded batches. Unmatched games use the shared catalog picker; choosing a match accepts and imports in one action. A copy's proposed source event time is what each of its linked sources added since the baseline. A source the baseline never saw counts in full if it was played since (it is a new game) and not at all if it was last played before the baseline (`minutesSince`). A service that cannot refresh still counts with its saved data, and the message says which.
- **Acceptance is explicit.** Each game keeps its last accepted source readings and approved result. Reviewing does not advance them or the player’s last-updated timestamp. Accepting one game never advances another; leaving the page discards the review, and the next Update regenerates outstanding changes. The original starting baseline never moves. Reviews carry a comparison signature, and an intervening edit or acceptance requires another review.
- **Edits are adjustments.** A player or host who enters 3 hours where the accepted source time is 2 stores +1 hour; a later source reading proposes its actual event total, and only acceptance replaces the event hours. For example, if the source reaches 3 hours, accepting it saves 3 rather than adding the previously entered hour again. Beaten/100% corrections stay unless the provider stage changes and the player accepts the new stage.
- **Library total.** The saved library hours and event hours remain separate. Displayed library playtime is its existing manual or provider total; games with provider-reported lifetime totals add no event hours. For games without a reported total, add positive manual event adjustments across non-removed event rows for the same player, game, and platform. A manual-only event game contributes all its hours; games with provider totals contribute zero extra because lifetime totals already contain them. The library popup edits the base hours and shows the event contribution and combined total separately. Editing either value never writes the other. Overlapping events do not duplicate imported provider time. Leaving an event keeps its saved hours; removing a game excludes its event contribution.
- **The player's own library time does not feed events.** Only connected services' totals produce proposed source event time. Games no service tracks (a Switch game, say) get their event hours by hand on the event page. Otherwise a player filling in lifetime hours in their library during an event would see them counted as event play.
- After the lock, nothing updates, so a player who forgets a last update before the end keeps their last values; hosts can still correct them.

What each service provides:

| Service | Playtime total | Achievements with dates | Completion with date |
| --- | --- | --- | --- |
| Steam | Lifetime minutes | Not stored | — |
| Xbox | `MinutesPlayed` stat, read on refresh | Unlocks | Every achievement (100%) |
| PlayStation | PS4 and PS5 only | Earned trophies | Platinum, or every base trophy (100%) |
| RetroAchievements | Per game, reread after it is played again | Unlocks | Beaten; every achievement (100%) at the final unlock |
| Library | — | — | Completed mark (beaten) |

## Beaten and completed

- A game has two stages: **beaten** and **completed** (100%: mastered, platinum, every achievement). Completed always counts as beaten too.
- The event proposes a stage when a dated record falls inside the event: beaten from the library's completed mark or RetroAchievements beaten; completed from every Xbox achievement, the PlayStation platinum (or every trophy without one), or every RetroAchievements achievement.
- **Replays count** (a replay or speedrun event, for example). Integrations record only the first completion ever, so a replayed game is marked beaten by hand, for the event only.
- Achievements and trophies earned during the event appear in the wrap-up but never score.
- Players and hosts set each stage to yes or no for the event; choosing the automatic value clears the edit.

## Scoring

- Three multipliers per event, in steps of 0.1 from 0 to 100 (stored as tenths): **points per hour** (default 1), **beaten bonus per hour** (default 1), and **completed bonus per hour** (default 0).
- A game scores `event hours × (hour multiplier + beaten multiplier if beaten + completed multiplier if completed)`. There is no fixed length per game: the bonus uses the player's own event hours on that game. Five event hours, beaten, beaten multiplier 2: 5 + 10 = 15 points. At 0.5: 7.5.
- **Console and game multipliers** replace the event's own for that IGDB platform or game (the "PS2 season"). The most specific wins: game, then console, then event; they never stack. Console multipliers live in the event form itself, on **New event** and the hosts' page, behind a **Score a console differently** button that opens the shared searchable platform dropdown, so they can be set while creating an event; the form saves the whole list with the event, and the server names each console from IGDB's catalog. Game multipliers are a separate card on the hosts' page.
- Multipliers apply when the leaderboard is read, so changing one rescores everyone at once.
- **Games beaten** is counted separately and is not part of the score. Standings rank by score, then games beaten, then name; equal score and beaten count share a rank. Points show with one decimal.
- Each platform copy is its own row, so the same game on two platforms scores twice. Limits such as "one platform per game" are written rules that hosts enforce.

## Rules

Each event has free-text rules (up to 4,000 characters) for what the site cannot check, such as "a game needs at least 8 hours of play before it counts as beaten". They show collapsed under the event name. Players apply them on the honor system with event-only edits, and hosts correct results.

## Copying

Copying keeps the description, rules, visibility, dates, scoring, and multipliers, names the copy "… (copy)", makes the copier its owner, and opens its settings to change the dates. Players, hosts, invitations, and results stay with the original.

## Data model

| Table | Holds |
| --- | --- |
| `events` | Owner, name, description, rules, visibility, first and last day, time zone, `starts_at`/`ends_at`, the three multipliers in tenths. |
| `event_hosts` | Co-managers besides the owner. |
| `event_multipliers` | Platform or game multipliers, unique per event, kind, and target, with the platform or game name and cover for display. |
| `event_members` | `invited`, `joined`, or `left`, who invited, join time, the baseline time and JSON, and the last update time. |
| `event_games` | One row per player, IGDB game, and platform: the library copy, snapshot name and cover, automatic minutes, beaten and completed times, and achievements; the edit adjustment and beaten/completed choices; a removed flag. Acceptance writes source readings and approved values together, saving the reviewed result; reviews do not write games, and removed games stay removed. |

Migration `0024_striped_mad_thinker.sql` adds them. Time played in the library (migration `0023`) is separate; see [architecture](architecture.md#time-played).

Implementation: `lib/event-rules.ts` (pure: dates, permissions, baselines, results, scoring, leaderboard, settings validation), `lib/event-queries.ts` (SQL tested in `tests/events.test.ts`), `lib/events.ts` (loading, actions, refresh, review, and acceptance), `lib/event-review.ts` (pure change comparison), `app/api/events/`, and `app/events/` (list, event page, hosts' page, and settings form).

## Not built yet

- Players creating events and inviting friends (the permission check above).
- Ending-day reminders or a scheduled final update. Nothing runs on the server without a page open, so the baseline and updates happen when players visit.
- Removing an event from the site; for now that is a trusted D1 operation.
