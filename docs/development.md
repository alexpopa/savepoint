# Development and setup

## Prerequisites

- Node.js 22.13 or newer and npm. `package-lock.json` is the dependency lockfile.
- A Twitch developer application with a confidential client and 2FA enabled. Its client ID and secret allow the server to call IGDB. See [IGDB's getting-started guide](https://api-docs.igdb.com/#getting-started).

## Local setup

From the repository root:

1. Copy `.dev.vars.example` to `.dev.vars` and replace both placeholders. The Cloudflare Vite runtime reads these values as server-side bindings. `.dev.vars` is ignored by Git.
2. Run `npm run install:ci` to install the locked dependencies.
3. Run `npm run build` to produce `dist/server/wrangler.json`, which the local D1 migration command uses.
4. Apply the checked-in migrations to local D1 in order:

   ```sh
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_marvelous_wolverine.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_bored_rage.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_brave_wallop.sql
   ```

   For an existing database, run only the migrations that have not yet been applied. `0002` adds challenges.

5. Run `npm run dev`. In the default **portable** profile, visit `http://localhost:5173/signin-with-chatgpt?return_to=/` to sign in as `seedy@sites.test`. To exercise friend requests, use `http://localhost:5173/signin-with-chatgpt?user=2&return_to=/` in a separate browser profile for `player2@sites.test`. The browser gets a local, HTTP-only cookie; the local Vite plugin supplies authentication headers to the app. This is only a development simulation.

The top search bar opens `/search?q=...` and searches both IGDB games and accounts already created in local D1. To find the second simulated player, first open RGBoner while signed in as that player, then search their name or email text from the first browser profile. Search results do not show account email addresses or private library items. A friend request can be sent by player ID from search results or a profile; accepting it in the second profile unlocks that player's private library.

Local D1 state is stored under `.wrangler/state`. Keep the `--persist-to .wrangler/state` argument when applying migrations so the migration and app use the same local database. The runtime may also create `.sites-runtime/`, `.next/`, `.vinext/`, and `dist/`; these are generated or local state.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server (portable profile uses Vinext on port 5173). |
| `npm run build` | Build the Cloudflare worker and copy hosting config and migrations into `dist/.openai/`. |
| `npm run start` | Serve the built worker with local Wrangler and the same persisted D1 state. |
| `npm run db:generate` | Generate a Drizzle SQL migration from `db/schema.ts` changes. |
| `npm run lint` | Run ESLint. |

`scripts/execution-profile.mjs` reads the ignored `.sites-runtime/execution-profile.json`. A missing file means `portable`. The `managed-linux` profile uses a different build and development runner, and disables the local authentication simulation. Do not rely on the simulated sign-in when verifying a hosted deployment.

## Database changes

1. Edit `db/schema.ts`.
2. Run `npm run db:generate` and review the new SQL and Drizzle metadata in `drizzle/`.
3. Run `npm run build` so the current server config and migrations are available in `dist/`.
4. Apply each new migration to local D1 using the command above with its actual filename substituted for `drizzle/0000_marvelous_wolverine.sql`.
5. Verify the affected API flow and update [architecture.md](architecture.md) if the data model or behavior changed.

The tables are `library_items`, `accounts`, `friendships`, and `challenges`. The unique index on `(user_id, igdb_id)` prevents duplicate saved games. `accounts.is_public` defaults to false, and account records are created on first app use. `friendships` stores one canonical row per user pair, with a requester and `pending` or `accepted` status. `challenges` stores the recipient, creator, IGDB game ID, a snapshot of the game name and cover, title, description, each participant's confirmation, recipient decline, favorite, and manual order. It does not reference a library row, so removing a game preserves its challenges. `added_at` and `created_at` are Unix timestamps in milliseconds. `platforms_json` stores IGDB platform names as catalog metadata; the library currently saves one entry per IGDB game.

## Hosted configuration

Use [Deploy RGBoner with Sites](deployment.md) for the release steps, Site secrets, audience settings, production migrations, verification, and recovery. `.openai/hosting.json` requests a logical D1 binding named `DB`; `db/index.ts` uses that binding. The build copies checked-in Drizzle migrations to `dist/.openai/drizzle/`, and Sites applies pending migrations to hosted D1 during publication before uploading the Worker. Local Wrangler migration commands above do not update hosted D1.

The hosted Site needs `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` as Site secrets. Authentication in the hosted environment must provide the `oai-authenticated-user-id` and `oai-authenticated-user-email` request headers through the trusted platform layer. The local simulated sign-in is implemented only in the development Vite plugin.
