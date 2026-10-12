# Integration sync workflow

How a connected game service (Steam, Xbox, PlayStation, RetroAchievements, and any future one) refreshes, matches, and adds games. Steam, Xbox, PlayStation, and RetroAchievements follow this exactly; a new integration copies them. Behavior specific to one service lives in [architecture](architecture.md); visual rules live in the [style guide](style-guide.md).

## The flow

1. **Connect.** The player links the service to their verified account. Identity is verified by the provider; a pasted ID is never proof. (PlayStation's pasted NPSSO is a Sony sign-in credential, exchanged at once; the account comes from Sony. RetroAchievements has no sign-in for other sites, so the player puts a one-time code in their RA motto, which only the account owner can edit, and RGBoner reads it back by the account's permanent ID.)
2. **Refresh** is manual and rate limited. It stores the player's games from the provider as personal source rows tied to the refresh timestamp (`synced_at`), and never deletes or edits library copies.
3. **Sync** matches source rows to IGDB games in bounded sequential batches (and reads any other background data, such as Xbox and RetroAchievements achievements and PlayStation trophies). Sync never adds anything to the library.
4. **Add** is the player's decision: one game at a time, from the game popup, or with one bulk button (**Import all games** on Steam, **Add all** on Xbox, PlayStation, and RetroAchievements) that appears once matching has finished.
5. **Remove all games** deletes only the library copies this connection added or linked. Ratings and favorites stay, and removed games are not added again automatically.
6. **Disconnect** erases the service's data and keeps library copies.

## Sync, pause, and leaving the page

- Sync is driven by the open settings page: a client effect sends one batch request at a time and schedules the next after the response. Nothing runs on the server once the page is closed, so leaving the page stops sync and returning resumes from the saved progress.
- **Pause is saved on the connection** (`<service>_connections.sync_paused`, boolean, default false), never in component state. A paused sync stays paused after leaving, reloading, or opening the page on another device, until the player clicks Resume. The client reads `connection.paused` from the service state and only schedules batches while it is false.
- Pause, Resume, an error pause, and opening **Remove all games** all go through a `pause` action (`{ action: "pause", paused: boolean }`) that updates the column for the signed-in account. A successful Refresh clears it.
- The client updates `paused` in its state immediately, then saves it. Every player action, including pausing, bumps the page's `epoch` so a batch already in flight cannot overwrite what the player now sees.
- Batches never disable the page. Errors pause sync, show the message in an alert, and offer Resume.
- A batch fails with "could not make progress" if the remaining count did not shrink, so sync cannot loop.
- The bulk add button runs its own batches until nothing is ready, keeps the player's filter, search, and page, and reports the number actually added.

## Remove all games

- Always enabled when games are in the library. Opening it pauses sync (and cancels a bulk add in progress), so games added while paused or mid-sync can be cleared.
- The confirmation button waits while a batch is running, because removal takes the same connection lease as every other write.
- It runs under the connection lease, deletes only this connection's copies, and keeps `imported_at` so removed games are not re-added.

## Checklist for a new integration

1. Copy the Steam, Xbox, PlayStation, or RetroAchievements tables and add `sync_paused boolean not null default false` to the connection table. Add a forward migration and document it.
2. Return `paused` inside the connection object of the state response, and add `pause` to the POST route with `typeof input.paused === "boolean"` validation. Clear it in the refresh write.
3. In the settings client, derive `const paused = state?.connection?.paused ?? false`, use a `setPaused` helper that bumps the epoch, updates state, and saves, and gate the batch effect on it. Copy `app/settings/steam/steam-settings.tsx`.
4. Matching never adds games. Add games only through the popup or the single bulk button.
5. Add **Remove all games** with the behavior above, and test the SQL against real migrations in `tests/`.
6. Document the service in [architecture](architecture.md), its migration in [development](development.md) and [deployment](deployment.md), and its screen in the [style guide](style-guide.md); keep this file in sync when the shared workflow changes.
7. Check in a browser: pause, reload, and confirm it stays paused; Resume continues; Remove all games pauses sync and clears games added earlier.
