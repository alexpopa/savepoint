# Development and setup

## Prerequisites

- Node.js 22.13 or newer and npm. `package-lock.json` is the dependency lockfile.
- A Twitch developer application with a confidential client and 2FA enabled. Its client ID and secret allow the server to call IGDB. See [IGDB's getting-started guide](https://api-docs.igdb.com/#getting-started).

## Local setup

From the repository root:

1. Copy `.dev.vars.example` to `.dev.vars` and replace the two IGDB placeholders. `AUTH_EMAIL_MODE=console` prints local verification and password reset links in the server log; use only for local development. The Cloudflare Vite runtime reads these values as server-side bindings. `.dev.vars` is ignored by Git.
2. Run `npm run install:ci` to install the locked dependencies.
3. Run `npm run build` to produce `dist/server/wrangler.json`, which the local D1 migration command uses.
4. Apply the checked-in migrations to local D1 in order:

   ```sh
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_marvelous_wolverine.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_bored_rage.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_brave_wallop.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_bumpy_blink.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_exotic_morph.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_amusing_pretty_boy.sql
   ```

   For an existing database, run only the migrations that have not yet been applied. `0002` adds challenges; `0003` adds email passwords and sessions; `0004` adds sign-in attempt tracking; `0005` adds email verification and reset tokens.

5. Run `npm run dev` and visit `http://localhost:5173/`. Visitors land on search; choose **Sign in → Create an account** or visit `http://localhost:5173/login` directly. Enter a display name, email, and password of at least 12 characters. Open the verification link from the development server log, then sign in. To exercise friend requests, create a second verified email account in another browser profile. The app sets an HTTP-only session cookie and stores its token hash in local D1.

The top search bar opens `/search?q=...` for visitors and signed-in players. It searches IGDB games and email accounts already created in local D1. Signed-out visitors can match player display names; email-text matching and friendship state require sign-in. Search results do not show account email addresses or private library items. A friend request can be sent by player ID from search results or a profile; accepting it in the second profile unlocks that player's private library.

Local D1 state is stored under `.wrangler/state`. Keep the `--persist-to .wrangler/state` argument when applying migrations so the migration and app use the same local database. The runtime may also create `.sites-runtime/`, `.next/`, `.vinext/`, and `dist/`; these are generated or local state.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server (portable profile uses Vinext on port 5173). |
| `npm run build` | Build the Cloudflare worker and copy hosting config and migrations into `dist/.openai/`. |
| `npm run start` | Serve the built worker with local Wrangler and the same persisted D1 state. |
| `npm run db:generate` | Generate a Drizzle SQL migration from `db/schema.ts` changes. |
| `npm run lint` | Run ESLint. |

`scripts/execution-profile.mjs` reads the ignored `.sites-runtime/execution-profile.json`. A missing file means `portable`. The `managed-linux` profile uses a different build and development runner. Both profiles use the same D1-backed email authentication.

## Database changes

1. Edit `db/schema.ts`.
2. Run `npm run db:generate` and review the new SQL and Drizzle metadata in `drizzle/`.
3. Run `npm run build` so the current server config and migrations are available in `dist/`.
4. Apply each new migration to local D1 using the command above with its actual filename substituted for `drizzle/0000_marvelous_wolverine.sql`.
5. Verify the affected API flow and update [architecture.md](architecture.md) if the data model or behavior changed.

The tables are `library_items`, `accounts`, `sessions`, `login_attempts`, `auth_tokens`, `friendships`, and `challenges`. The unique index on `(user_id, igdb_id)` prevents duplicate saved games. `accounts.is_public` defaults to false, and email account records are created at registration but cannot sign in or appear in player search until verified. `auth_tokens` stores hashed, expiring, single-use verification and password reset links. `friendships` stores one canonical row per user pair, with a requester and `pending` or `accepted` status. `challenges` stores the recipient, creator, IGDB game ID, a snapshot of the game name and cover, title, description, each participant's confirmation, recipient decline, favorite, and manual order. It does not reference a library row, so removing a game preserves its challenges. `added_at` and `created_at` are Unix timestamps in milliseconds. `platforms_json` stores IGDB platform names as catalog metadata; the library currently saves one entry per IGDB game.

## Hosted configuration

Use [Deploy RGBoner with Sites](deployment.md) for the release steps, Site secrets, audience settings, production migrations, verification, and recovery. `.openai/hosting.json` requests a logical D1 binding named `DB`; `db/index.ts` uses that binding. The build copies checked-in Drizzle migrations to `dist/.openai/drizzle/`, and Sites applies pending migrations to hosted D1 during publication before uploading the Worker. Local Wrangler migration commands above do not update hosted D1.

The hosted Site needs `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, and `RESEND_API_KEY` as Site secrets, plus `AUTH_EMAIL_FROM` on a verified sender domain and `AUTH_PUBLIC_URL` set to its HTTPS origin. The app authenticates visitors from its own D1 accounts and sessions. To let visitors reach its sign-in page without ChatGPT login, the Site audience must be public. Email verification is required before sign-in; the same email service sends password reset links. The local console delivery mode is disabled for non-local hosts. Existing ChatGPT-based records remain in D1 but are excluded from the new account directory and cannot sign in.
