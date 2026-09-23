# RGBoner

RGBoner is a video game library for signed-in players. Use the search bar in the top navigation to find IGDB games and RGBoner players on one results page. Save games, connect with players, and choose whether your profile is public or private. Profiles start private; accepted friends can view each other's libraries and challenges. Friends can add challenges to games in each other's libraries. Game details come from IGDB, while accounts, friendships, collections, and challenges live in Cloudflare D1.

The interface follows a clean retro RGB direction: the pixel wordmark anchors a dark, sharp-edged layout while game artwork keeps its original rendering style. See the visual style guide before changing the UI.

## Start here

- [Local setup and database workflow](docs/development.md)
- [Deploy with Sites](docs/deployment.md)
- [Architecture, request flow, and API](docs/architecture.md)
- [Visual style guide for RGBoner](docs/style-guide.md)
- [Instructions for future agents](AGENTS.md)

## Quick local run

Requires Node.js 22.13 or newer, npm, and Twitch developer credentials for IGDB.

1. Copy `.dev.vars.example` to `.dev.vars` and fill in `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`. Keep `.dev.vars` private.
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
   ```

   Apply only the migrations that your local database has not yet received.

4. Run `npm run dev` and open `http://localhost:5173/signin-with-chatgpt?return_to=/`. In the portable local profile, this signs in the first simulated local user. Use `?user=2&return_to=/` on the same sign-in path in another browser profile to test friendship flows.

Use the top search bar to find games or players, including players with private profiles. You can send a friend request from a search result or player profile without knowing their email; private games and challenges remain hidden until the request is accepted. On a friend's saved game, choose **Add challenge** to enter a title and description. The game and your profile both show its pending or completed state. Open **My profile** to confirm, decline, favorite, and rank challenges. Visit **Settings & friends** to change visibility or send a request by email. **Browse players** lists public profiles and profiles shared by accepted friends. Only signed-in players can browse other profiles.

See [development.md](docs/development.md) before changing the schema, and [deployment.md](docs/deployment.md) before publishing to Sites.
