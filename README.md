# Savepoint

Savepoint is a private video game library. A signed-in user searches IGDB, adds games to a personal collection, and removes them later. Game details come from IGDB; the collection lives in Cloudflare D1.

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

3. Apply the checked-in migration to local D1:

   ```sh
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_marvelous_wolverine.sql
   ```

4. Run `npm run dev` and open `http://localhost:5173/signin-with-chatgpt?return_to=/`. In the portable local profile, this signs in the simulated local user.

See [development.md](docs/development.md) before changing the schema or setting up a hosted environment.
