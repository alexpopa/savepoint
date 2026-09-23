# Savepoint

Savepoint is a video game library for signed-in players. Use the search bar in the top navigation to find IGDB games and Savepoint players on one results page. Save games, connect with players, and choose whether your library is public or private. Libraries start private; accepted friends can view each other's libraries. Game details come from IGDB, while accounts, friendships, and collections live in Cloudflare D1.

## Start here

- [Local setup and database workflow](docs/development.md)
- [Architecture, request flow, and API](docs/architecture.md)
- [Instructions for future agents](AGENTS.md)

## Quick local run

Requires Node.js 22.13 or newer, npm, and Twitch developer credentials for IGDB.

1. Copy `.dev.vars.example` to `.dev.vars` and fill in `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`. Keep `.dev.vars` private.
2. Install dependencies and build:

   ```sh
   npm run install:ci
   npm run build
   ```

3. Apply both checked-in migrations to local D1 in order:

   ```sh
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_marvelous_wolverine.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_bored_rage.sql
   ```

   If your local database already has the initial migration, apply only `0001_bored_rage.sql`.

4. Run `npm run dev` and open `http://localhost:5173/signin-with-chatgpt?return_to=/`. In the portable local profile, this signs in the first simulated local user. Use `?user=2&return_to=/` on the same sign-in path in another browser profile to test friendship flows.

Use the top search bar to find games or players, including players with private libraries. You can send a friend request from a search result or player profile without knowing their email; private game lists remain hidden until the request is accepted. Visit **Settings & friends** to change visibility or send a request by email. **Browse players** lists public libraries and libraries shared by accepted friends. Only signed-in players can browse other libraries.

See [development.md](docs/development.md) before changing the schema or setting up a hosted environment.
