# RGBoner

RGBoner is a video game library for players with verified email and password accounts. Visitors can search games and players before signing in; an account is required to save games, add friends, and use personal features. Use the search bar in the top navigation to find IGDB games and RGBoner players on one results page. Save games, connect with players, and choose whether your profile is public or private. Profiles start private; accepted friends can view each other's libraries and challenges. Friends can add challenges to games in each other's libraries. Game details come from IGDB, while accounts, friendships, collections, and challenges live in Cloudflare D1.

This source repository is [`alexpopa/savepoint`](https://github.com/alexpopa/savepoint). It builds the RGBoner Site at [retrogameboner.com](https://retrogameboner.com); the local checkout directory may have a different name.

The interface follows a clean retro RGB direction: the pixel wordmark anchors a dark, sharp-edged layout while game artwork keeps its original rendering style. Game search can be narrowed by one or more platforms; games available on any selected platform are searched in IGDB before applying the 30-result limit. The platform dropdown contains checkboxes, and **Remove filter** clears the selection. Search cards open a larger game file with IGDB details and the full platform list. Save a separate copy for each platform you own; games with only one listed platform can be added directly from search. In My library and on another player's profile, open a game to view its details and manage your own platform copies. Public profiles recover missing covers from IGDB, including legacy rows whose stored IDs no longer resolve, and refresh saved cover URLs when an image fails to load. See the visual style guide before changing the UI.

## Start here

- [Local setup and database workflow](docs/development.md)
- [Current local test accounts](docs/local-test-accounts.md)
- [Deploy with Sites](docs/deployment.md)
- [Architecture, request flow, and API](docs/architecture.md)
- [Visual style guide for RGBoner](docs/style-guide.md)
- [Instructions for future agents](AGENTS.md)

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
   ```

   Apply only the migrations that your local database has not yet received.

4. Run `npm run dev` and open `http://localhost:5173/`. Search as a visitor, then choose **Sign in → Create an account**, or open `/login` directly. Enter a unique display name, email, and password of at least 12 characters. The display name becomes the player's profile URL, such as `/users/Player%20Two`. Open the verification link printed in the development server log before signing in. Create a second account in another browser profile to test friendship flows.

Use the top search bar to find games or players, including players with private profiles. Open the account menu beside it to reach **My library**, **My profile**, **Browse players**, and **Settings & friends**, or to sign out. You can send a friend request from a search result or player profile without knowing their email; private games and challenges remain hidden until the request is accepted. On a friend's saved game, choose **Add challenge** to enter a title and description. Challenge cards show the game's cover and title with the challenge title, omit the description from the card, and link participant names to their profiles. Click a challenge's cover or title to open a compact detail popup with the game cover, challenge title, game name, and description. In the collection, each game's expanded Challenges list shows clickable challenge titles alongside available confirmation and recipient remove controls; clicking a title opens the same popup with its description. Use the hollow green circle to confirm your part; it fills when you have confirmed, and the card edge turns green once both players confirm. Use the star to favorite a challenge. The challenged player can use the top-right X to permanently remove it for both participants after confirmation. There is no separate decline action. On **My profile**, recipients can use the arrow controls to rank favorited challenges within Pending or Completed. Visit **Settings & friends** to change visibility or send a request by email. **Browse players** lists public profiles and profiles shared by accepted friends. Only signed-in players can browse other profiles.

See [development.md](docs/development.md) before changing the schema, and [deployment.md](docs/deployment.md) before publishing to Sites.
