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
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0006_tired_mister_fear.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0007_neat_retro_girl.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0008_steady_paladin.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0009_abandoned_kingpin.sql
   ```

   For an existing database, run only the migrations that have not yet been applied. `0002` adds challenges; `0003` adds email passwords and sessions; `0004` adds sign-in attempt tracking; `0005` adds email verification and reset tokens; `0006` adds a selected platform to each library row and changes uniqueness to `(user_id, igdb_id, platform_id)`; `0007` makes display names unique across email accounts without regard to ASCII letter case. `0008` adds nullable challenge `timeline_at`; existing challenges stay out of the timeline until a new visible state transition. `0009` adds indexes for the popular recent games query. Existing library rows get platform ID `0` (“Platform not set”) and can be edited after migration.

5. Run `npm run dev` and visit `http://localhost:5173/`. Visitors land on search; choose **Sign in → Create an account** or visit `http://localhost:5173/login` directly. Enter a unique display name, email, and password of at least 12 characters. Open the verification link from the development server log, then sign in. To exercise friend requests, create a second verified email account in another browser profile. The app sets an HTTP-only session cookie and stores its token hash in local D1.

The persisted local database in this checkout also contains sample player accounts. See [Local test accounts](local-test-accounts.md) for their current status and saved game counts; these records are not recreated by migrations.

The top search bar opens `/search?q=...` for visitors and signed-in players. It searches IGDB games and email accounts already created in local D1. The Games heading shows the returned result count. Its platform dropdown has full-row checkbox options and a search field with a separate X button that clears selected platforms. Typing in the search field narrows the visible options and leaves selected platforms unchanged; selecting one or more platforms sends their IGDB IDs with the search term, and IGDB returns games available on any selected platform before the 30-result limit. While a new game search runs, the existing cards stay in place in a muted, inactive state; the player results remain visible. The X button clears the platform selection without closing the dropdown. Selected platforms are kept as repeated `platform` query parameters in the URL. The platform catalog is fetched from IGDB and cached by the server for 24 hours. Platform filtering affects games only. Signed-out visitors can match player display names; email-text matching and friendship state require sign-in. Search results do not show account email addresses or private library items. A friend request can be sent by player ID from search results or a profile; accepting it in the second profile unlocks that player's private library.

Opening `/search` without a term shows up to six games ranked by distinct players who added them during the past 14 days, using current library rows. A game saved on multiple platforms by one player counts once. The server limits the ranking to six games; ties use the most recent add, then IGDB ID. The cards use stored game details, recover missing covers and legacy IDs from IGDB when needed, and open the usual detail dialog. If no games qualify, the page shows an empty message. This read is public and reveals aggregate counts, not player identities or libraries.

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

### Open the local preview on a phone with Tailscale

With the development Mac and phone connected to the same tailnet, configure Tailscale Serve to proxy the local Vite server:

```sh
tailscale serve --bg 127.0.0.1:5173
tailscale serve status
```

Use the HTTPS host shown by `tailscale serve status` as `TAILSCALE_SERVE_HOST` when starting the app. Specify only the hostname, without a scheme or port:

```sh
TAILSCALE_SERVE_HOST="machine-name.tailnet.ts.net" npm run dev -- --hostname 127.0.0.1
```

Replace `machine-name.tailnet.ts.net` with the host shown by `tailscale serve status`. Open the HTTPS address from that command on the phone. The app must keep running, and Vite allows only that explicitly configured tailnet hostname. Tailscale Serve keeps the preview available within the tailnet.

## Database changes

1. Edit `db/schema.ts`.
2. Run `npm run db:generate` and review the new SQL and Drizzle metadata in `drizzle/`.
3. Run `npm run build` so the current server config and migrations are available in `dist/`.
4. Apply each new migration to local D1 using the command above with its actual filename substituted for `drizzle/0000_marvelous_wolverine.sql`.
5. Verify the affected API flow and update [architecture.md](architecture.md) if the data model or behavior changed.

The tables are `library_items`, `accounts`, `sessions`, `login_attempts`, `auth_tokens`, `friendships`, and `challenges`. The unique index on `(user_id, igdb_id, platform_id)` prevents saving the same game twice on one platform while allowing separate platform copies. The library's `(added_at, igdb_id, user_id)` and `(igdb_id, added_at)` indexes support the recent popularity ranking and latest game snapshot lookup. Email and display-name unique indexes apply to email accounts (rows with a password hash); display-name uniqueness uses SQLite `lower(display_name)`, which folds ASCII case. Existing email accounts with duplicate names under that rule must be renamed before applying `0007`, or the index creation will fail. Check with `SELECT lower(display_name), count(*) FROM accounts WHERE password_hash IS NOT NULL GROUP BY lower(display_name) HAVING count(*) > 1;`. `accounts.is_public` defaults to false, and email account records are created at registration but cannot sign in or appear in player search until verified. `auth_tokens` stores hashed, expiring, single-use verification and password reset links. `friendships` stores one canonical row per user pair, with a requester and `pending` or `accepted` status. `challenges` stores the recipient, creator, IGDB game ID, a snapshot of the game name and cover, title, description, each participant's confirmation, a legacy recipient decline timestamp, favorite, and manual order. New challenges have no decline action; only the challenged player can permanently remove one. It does not reference a library row, so removing a game preserves its challenges. `added_at` and `created_at` are Unix timestamps in milliseconds. `platform_id` and `platform_name` identify the chosen IGDB platform; `platforms_json` keeps the catalog list of platform names. Platform ID `0` marks a legacy row without a choice or a game for which IGDB lists no platform.

## Hosted configuration

Use [Deploy RGBoner with Sites](deployment.md) for the release steps, Site secrets, audience settings, production migrations, verification, and recovery. `.openai/hosting.json` requests a logical D1 binding named `DB`; `db/index.ts` uses that binding. The build copies checked-in Drizzle migrations to `dist/.openai/drizzle/`, and Sites applies pending migrations to hosted D1 during publication before uploading the Worker. Local Wrangler migration commands above do not update hosted D1.

The hosted Site needs `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, and `RESEND_API_KEY` as Site secrets, plus `AUTH_EMAIL_FROM` on a verified sender domain and `AUTH_PUBLIC_URL` set to its HTTPS origin. The app authenticates visitors from its own D1 accounts and sessions. To let visitors reach its sign-in page without ChatGPT login, the Site audience must be public. Email verification is required before sign-in; the same email service sends password reset links. The local console delivery mode is disabled for non-local hosts. Existing ChatGPT-based records remain in D1 but are excluded from the new account directory and cannot sign in.

Registration exceptions are written to the server's error output with their stack trace while the browser receives only a generic error. In local development, inspect the server terminal. In production, ask Codex to inspect the Site's production Worker logs; Sites Analytics shows traffic metrics, not exception details. Do not log request bodies or credentials.

## Timeline verification

Run `node --experimental-strip-types --test tests/timeline.test.ts` for the rolling 24-hour grouping boundaries and final feed limit. Signed-in `/` renders friend activity; `/library` retains the collection UI. Confirm and undo a challenge from the existing profile controls, then reload home: recipient confirmation and completion changes update the row, while creator-only confirmation, favorites, and ranking do not bump it. Test private non-friend challenge participants and friendship removal as well. See [timeline behavior](timeline-design.md).
