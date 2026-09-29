# RGBoner

RGBoner is a video game library for players with verified email and password accounts. Visitors can search games and players and open public profiles before signing in; an account is required to save games, add friends, and use personal features. Use the search bar in the top navigation to find IGDB games and RGBoner players on one results page. Save games, connect with players, and choose whether your profile is public or private. Profiles start private; public profiles show their games, favorites, and challenges to everyone, while accepted friends and site admins can view private libraries and challenges. Admins have every application permission, with no public role indicators or admin management UI. See [roles and permissions](docs/architecture.md#roles-and-permissions) for the rules future pages must follow. Friends can add challenges to games in each other's libraries. Game details come from IGDB, while accounts, friendships, collections, and challenges live in Cloudflare D1.

This source repository is [`alexpopa/savepoint`](https://github.com/alexpopa/savepoint). It builds the RGBoner Site at [retrogameboner.com](https://retrogameboner.com); the local checkout directory may have a different name.

The interface follows a clean retro RGB direction: the pixel wordmark anchors a dark, sharp-edged layout while game artwork keeps its original rendering style. Idle search shows popular recent games in the same compact, cover-left card style as My library, without its challenges area. Game search can be narrowed by one or more platforms; games available on any selected platform are searched in IGDB before applying the 30-result limit. Changing platforms refreshes only the game results in place, keeping the current cards visible while IGDB responds. The Games heading shows the returned result count. The platform dropdown has a search field above full-row checkbox options to narrow choices without changing selections; its separate X control clears selected platforms. Search cards open a larger game file with IGDB details and the full platform list. Save a separate copy for each platform you own; games with only one listed platform can be added directly from search. In My library and on another player's profile, open a game to view its details and manage your own platform copies. Public profiles recover missing covers from IGDB, including legacy rows whose stored IDs no longer resolve; signed-in viewers can also refresh saved cover URLs when an image fails to load. See the visual style guide before changing the UI.

My library shows up to 12 saved platform copies per page, newest first. Search by game title and select one or more platforms using the same searchable checkbox filter as the Currently playing picker; both filters work together. The collection shows the visible range and page controls, and gives a clear message when no copies match. Opening a card still shows the game details and every platform you own.

With no search term, `/search` shows up to six games most added to player libraries in the last 14 days. Each player counts once per game even if they saved several platforms. Missing cover art and older saved game IDs are resolved through IGDB when available. Open a popular game to see its details and add a platform copy.

Players mark the platform copies they are currently playing from the play toggle on a library card or the **Playing** button beside an owned platform in any game details dialog. Only saved copies can be marked, and there is no limit. Profiles show **Currently playing** above the Top 10: the most recently started games as large covers with their platform (four on desktop, three on phones), and **Show all** reveals the rest in place. On My profile, a dashed plus spot fills the row while there is room; it opens a picker of your own platform copies, ten at a time, with a title search and the same searchable platform checkboxes as the search page, where **Add** and **Playing** toggle each copy without reloading the page. **Edit** shows an X on each cover to remove it; there is no reordering. Removing a copy from the library also removes its mark.

Players can favorite up to ten distinct games from the star button in any game details dialog, whether or not the game is in their library. Favorites form the player's Top 10 at the top of the profile: covers standing on two shelves of five, with the hovered or focused game's rank, name, and year shown beneath. On My profile, the next empty spot opens the same picker as Currently playing. It starts with the games in your library, one row per game, and switches to all of IGDB once you type two letters; the platform checkboxes filter either list. **Add** and **In Top 10** toggle each game in place until all ten spots are filled. **Edit** lets you pick up a cover and set it down in a new spot by clicking, dragging, or pressing Enter, and shows an X on each cover to remove it. Favorites follow profile privacy and survive library-copy removal.

Signed-in players land on a recent friend activity timeline. New game favorites and newly started currently playing copies appear there with the player and game; reordering does not bump activity. Library additions are grouped per friend into rolling 24-hour batches, alongside current challenge updates. The feed shows the latest 30 entries; expand a batch to see all its games. Select a game name to open its details and add it to your library, or use **+ Add challenge** beside it to create a challenge for that friend. Open a challenge's cover or title to see its description in the challenge details popup. Open **My library** under the account icon to manage your collection.

## Start here

- [Local setup and database workflow](docs/development.md)
- [Current local test accounts](docs/local-test-accounts.md)
- [Deploy with Sites](docs/deployment.md)
- [Architecture, request flow, and API](docs/architecture.md)
- [Friends timeline behavior](docs/timeline-design.md)
- [Visual style guide for RGBoner](docs/style-guide.md)
- [Coding conventions and settled decisions](docs/conventions.md)
- [Instructions for AI coding agents](AGENTS.md) (`CLAUDE.md` imports the same file)

## Quick local run

Requires Node.js 22.13 or newer, npm, and Twitch developer credentials for IGDB.

1. Copy `.dev.vars.example` to `.dev.vars` and fill in `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`. Keep `AUTH_EMAIL_MODE=console` for local verification and reset links in the server log. Keep `.dev.vars` private.
2. Install dependencies and build:

   ```sh
   npm run install:ci
   npm run build
   ```

3. Apply the checked-in migrations to local D1 in order:

   ```sh
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_marvelous_wolverine.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_bored_rage.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_brave_wallop.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_bumpy_blink.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_exotic_morph.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_amusing_pretty_boy.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0006_tired_mister_fear.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0007_neat_retro_girl.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0008_steady_paladin.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0009_abandoned_kingpin.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0010_user_roles.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0011_silly_mongu.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0012_hard_terrax.sql
   ```

   Apply only the migrations that your local database has not yet received.

4. Run `npm run dev` and open `http://localhost:5173/`. Search as a visitor, then choose **Sign in → Create an account**, or open `/login` directly. Enter a unique display name, email, and password of at least 12 characters. The display name becomes the player's profile URL, such as `/users/Player%20Two`. Open the verification link printed in the development server log before signing in. Create a second account in another browser profile to test friendship flows.

Use the top search bar to find games or players, including players with private profiles. Open the account menu beside it to reach **My library**, **My profile**, **Browse players**, and **Settings & friends**, or to sign out. Signed-in players can request friendship from search results or another player’s profile without knowing their email. The other player gets an email with a link to **Settings & friends**, where they can accept or decline. Signed-out profile visitors can follow the login link and return to that profile to request friendship. Private games and challenges remain hidden from regular players until the request is accepted. Admins can view them immediately and still have the usual friend request button. On a friend's saved game, choose **Add challenge** to enter a title and description. Challenge cards show the game's cover and title with the challenge title, omit the description from the card, and link participant names to their profiles. Click a challenge's cover or title to open a compact detail popup with the game cover, challenge title, game name, and description. In the collection, each game's expanded Challenges list shows clickable challenge titles alongside available confirmation and recipient remove controls; clicking a title opens the same popup with its description. Use the hollow green circle to confirm your part; it fills when you have confirmed, and the card edge turns green once both players confirm. Use the star to favorite a challenge. The challenged player can use the top-right X to permanently remove it for both participants after confirmation. There is no separate decline action. Profiles open with a nameplate: a pixel avatar generated from the account, the display name, the visibility or friendship state, and counts of games, cleared challenges, and pending challenges. Favorite completed challenges appear under Trophies below the Top 10. The rest of the challenges sit in Pending, Completed, and (on My profile) Sent tabs. Recipients can use the arrow controls to rank favorited challenges within Pending or Completed. Visit **Settings & friends** to change visibility or send a request by email. **Browse players** lists public profiles and profiles shared by accepted friends; admins can browse all verified players. Visitors can open public profiles directly from search or a profile link; private profiles remain locked without an accepted friendship or admin access.

See [development.md](docs/development.md) before changing the schema, and [deployment.md](docs/deployment.md) before publishing to Sites.
