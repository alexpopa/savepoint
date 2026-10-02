# Development and setup

## Prerequisites

- Node.js 22.13 or newer and npm. `package-lock.json` is the dependency lockfile.
- A Twitch developer application with a confidential client and 2FA enabled. Its client ID and secret allow the server to call IGDB. See [IGDB's getting-started guide](https://api-docs.igdb.com/#getting-started).

## Local setup

From the repository root:

1. Copy `.dev.vars.example` to `.dev.vars` and replace the two IGDB placeholders. `AUTH_EMAIL_MODE=console` prints every outgoing email (verification, password reset, and friend request) in the server log instead of sending it; use only for local development. The Cloudflare Vite runtime reads these values as server-side bindings. `.dev.vars` is ignored by Git.
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
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0010_user_roles.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0011_silly_mongu.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0012_hard_terrax.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0013_sparkling_serpent_society.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0014_easy_kid_colt.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0015_solid_maestro.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0016_workable_millenium_guard.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0017_moaning_psylocke.sql
   ```

   For an existing database, run only the migrations that have not yet been applied. `0002` adds challenges; `0003` adds email passwords and sessions; `0004` adds sign-in attempt tracking; `0005` adds email verification and reset tokens; `0006` adds a selected platform to each library row and changes uniqueness to `(user_id, igdb_id, platform_id)`; `0007` makes display names unique across email accounts without regard to ASCII letter case. `0008` adds nullable challenge `timeline_at`; existing challenges stay out of the timeline until a new visible state transition. `0009` adds indexes for the popular recent games query. `0010` adds account roles and the one-time grant for the confirmed production owner account; local test accounts remain regular players unless explicitly granted a role. `0011` adds independent game favorites, unique per player and IGDB game, with favorite timestamps and ordering. The add query enforces the ten-game limit atomically; reordering moves a favorite to a position and shifts the ones in between in one statement. `0012` adds a nullable `playing_since` timestamp to each library row for currently playing. `0013` adds `game_ratings`, one 1–5 score per player and IGDB game, and a nullable `completed_at` timestamp to each library row. `0014` adds per-player indexes that let the friends timeline read only friends' rows. `0015` adds `messages` for direct messages between friends, with indexes for paging a conversation and counting unread messages. `0016` adds Steam account connections, temporary OpenID state, shared catalog mappings, and personal Steam import records without changing existing library data. `0017` adds `library_items.updated_at` and indexes for recently updated library ordering and Steam import lookups. It is required for every installation, even without Steam configured, because ordinary library reads and writes use `updated_at`. Existing library rows get platform ID `0` (“Platform not set”) and can be edited after migration.

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
| `npm run typecheck` | Type check the project with TypeScript. |
| `npm test` | Run the `node:test` suites in `tests/`. |
| `npm run check` | Run lint, type check, and tests. Every change must pass it before it is finished. |
| `npm run d1 -- "<SQL>"` | Run SQL against local D1 and print the rows as JSON. Local only. |
| `npm run test-account` | Create or refresh the local `AgentTester` account for browser checks (`-- --reset` clears its activity). Needs `npm run dev`. |
| `npm run browser:install` | Install the local browser driver into `tools/browser/` (outside the root package). |
| `npm run browser -- <path>` | Screenshot a page at 1280px and 320px as `AgentTester` and report overflow and console errors. See [browser testing](browser-testing.md). |

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

The tables are `game_favorites`, `game_ratings`, `library_items`, `accounts`, `account_roles`, `sessions`, `login_attempts`, `auth_tokens`, `friendships`, `challenges`, `messages`, `steam_connections`, `steam_link_states`, `steam_mappings`, and `steam_games`. The unique index on `(user_id, igdb_id, platform_id)` prevents saving the same game twice on one platform while allowing separate platform copies. The library's `(added_at, igdb_id, user_id)` and `(igdb_id, added_at)` indexes support the recent popularity ranking and latest game snapshot lookup. Email and display-name unique indexes apply to email accounts (rows with a password hash); display-name uniqueness uses SQLite `lower(display_name)`, which folds ASCII case. Existing email accounts with duplicate names under that rule must be renamed before applying `0007`, or the index creation will fail. Check with `SELECT lower(display_name), count(*) FROM accounts WHERE password_hash IS NOT NULL GROUP BY lower(display_name) HAVING count(*) > 1;`. `accounts.is_public` defaults to false, and email account records are created at registration but cannot sign in or appear in player search until verified. `auth_tokens` stores hashed, expiring, single-use verification and password reset links. `friendships` stores one canonical row per user pair, with a requester and `pending` or `accepted` status. `challenges` stores the recipient, creator, IGDB game ID, a snapshot of the game name and cover, title, description, each participant's confirmation, a legacy recipient decline timestamp, favorite, and manual order. New challenges have no decline action; the challenged player or a site admin can permanently remove one. It does not reference a library row, so removing a game preserves its challenges. `added_at` and `created_at` are Unix timestamps in milliseconds. `platform_id` and `platform_name` identify the chosen IGDB platform; `platforms_json` keeps the catalog list of platform names. `playing_since` is set while that platform copy is currently playing and null otherwise. Platform ID `0` marks a legacy row without a choice or a game for which IGDB lists no platform. `messages` stores one row per direct message with the ordered player pair (like `friendships`), sender, recipient, a 1–2000 character body, `created_at`, and a nullable `read_at` set when the recipient reads it; deleting an account deletes its messages.

## Roles and trusted administration

`account_roles` stores one row per admin account: `user_id` references `accounts.user_id`, and `role` currently permits only `admin`. A player without a row is a regular player. Registration never creates a role. The foreign key deletes the grant if its account is deleted. Roles are loaded from D1 on every authenticated request, so an existing session sees a grant or revocation immediately. Do not trust an email, request body, cookie field, header, or client capability flag as a role.

Apply `drizzle/0010_user_roles.sql` locally with the command above. Sites applies it to production during deployment. Its bounded, one-time data statement grants `admin` only to the existing verified production account `1ffaf3ac-09e4-4e76-912a-c00a3258ff8e` (BlazeCloud), whose email was confirmed as `alex.florin.popa@gmail.com`. It also checks that email, a password hash, and verification exist. It does not grant future accounts with the same email and does not elevate dormant ChatGPT-era records. A local account with another ID is unaffected.

Admins can open the [admin portal](architecture.md#admin-portal) at `/admin` from the account menu; everyone else gets a 404 there. Admin grants and revocations are trusted database operations only. There is no role mutation API, role management page, registration flag, public role list, or public badge.

To make a local account an admin, first confirm its exact ID and that it is a verified email account (`npm run d1` is described in [browser testing](browser-testing.md#local-database)):

```sh
npm run d1 -- "SELECT a.user_id, a.display_name, a.password_hash IS NOT NULL AS has_password, a.email_verified_at IS NOT NULL AS verified, r.role FROM accounts a LEFT JOIN account_roles r USING (user_id) WHERE lower(a.display_name) = lower('BlazeCloud')"
```

Then apply the following SQL, with `npm run d1 -- "<SQL>"` or through local Wrangler using a temporary SQL file. Substitute that confirmed account ID; do not infer authorization from email alone. In this checkout's local database, BlazeCloud is an admin; its local ID differs from the production account's. No new sign-in is needed: the role applies on the next request.

```sql
INSERT INTO account_roles (user_id, role)
SELECT user_id, 'admin' FROM accounts
WHERE user_id = 'confirmed-account-id'
  AND password_hash IS NOT NULL AND email_verified_at IS NOT NULL;

-- Revoke an existing grant when explicitly authorized:
DELETE FROM account_roles WHERE user_id = 'confirmed-account-id';
```

Hosted D1 is managed by Sites. Use its trusted database administration workflow or an explicitly authorized, narrowly targeted forward migration for a production role change; local Wrangler is not a production administration tool. Never add a UI or public endpoint for granting or revoking admins.

Run `node --experimental-strip-types --test tests/challenge-honors.test.ts` for the six-challenge Hall of Honor limit, completion requirement, placement (including legacy rows sharing an order), and the challenge log search.

Run `node --experimental-strip-types --test tests/permissions.test.ts` for the privacy and confirmation permission matrix, role constraints, deletion cascade, and targeted production grant. With local admin and regular sessions, verify a private non-friend profile, its Add friend button, pending and accepted friendships, admin challenge controls, unauthorized resource writes, role revocation within an existing session, and role omission from account/player responses. Authentication, origin checks, and input validation apply to both roles. See [architecture](architecture.md#roles-and-permissions) before adding a new permission check.

## Hosted configuration

Use [Deploy RGBoner with Sites](deployment.md) for the release steps, Site secrets, audience settings, production migrations, verification, and recovery. `.openai/hosting.json` requests a logical D1 binding named `DB`; `db/index.ts` uses that binding. The build copies checked-in Drizzle migrations to `dist/.openai/drizzle/`, and Sites applies pending migrations to hosted D1 during publication before uploading the Worker. Local Wrangler migration commands above do not update hosted D1.

The hosted Site needs `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, and `RESEND_API_KEY` as Site secrets, plus `AUTH_EMAIL_FROM` on a verified sender domain and `AUTH_PUBLIC_URL` set to its HTTPS origin. The app authenticates visitors from its own D1 accounts and sessions. To let visitors reach its sign-in page without ChatGPT login, the Site audience must be public. Email verification is required before sign-in; the same email service sends password reset links and friend request notifications. The local console delivery mode is disabled for non-local hosts. Existing ChatGPT-based records remain in D1 but are excluded from the new account directory and cannot sign in.

Registration exceptions are written to the server's error output with their stack trace while the browser receives only a generic error. In local development, inspect the server terminal. In production, ask Codex to inspect the Site's production Worker logs; Sites Analytics shows traffic metrics, not exception details. Do not log request bodies or credentials.

## Timeline verification

Run `node --experimental-strip-types --test tests/timeline.test.ts` for the rolling 24-hour grouping boundaries and final feed limit, and `tests/timeline-queries.test.ts` for friend eligibility, cursors, and index use in the timeline SQL. Signed-in `/` renders friend activity; `/library` retains the collection UI. Confirm and undo a challenge from the existing profile controls, then reload home: recipient confirmation and completion changes update the row, while creator-only confirmation, favorites, and ranking do not bump it. Mark a friend's library copy as currently playing, then unmark it: the entry appears and then disappears. Test private non-friend challenge participants and friendship removal as well. See [timeline behavior](timeline-design.md).


## Steam configuration and checks

Steam is optional. Add a Steam Web API key as `STEAM_API_KEY` in local `.dev.vars`; it remains a server binding, never a browser value. Obtain the key through [Steam's developer page](https://steamcommunity.com/dev/apikey). Hosted installations use a Site secret with the same name and the existing exact HTTPS `AUTH_PUBLIC_URL` for OpenID callbacks. No Steam password, per-player API key, publisher key, or new dependency is required. Missing configuration disables Connect Steam and refreshes while allowing existing imported library copies to work.

The main setup sequence includes both `0016_workable_millenium_guard.sql` and `0017_moaning_psylocke.sql`; both must be applied before opening `/settings/steam`, and `0017` is also required for ordinary library use without Steam configured. With a running dev server, pending migrations can be applied through the local-only `d1` helper using each migration's contents; a Worker build is not required. Run `npm run check` for Steam parsers, HTTP boundary, OpenID verification, single-use linking, source isolation, stale leases, idempotent merging, exclusions, and disconnect preservation. `npm run browser -- /settings/steam` checks the responsive screen as AgentTester.

A real end-to-end test requires the configured key and the user's own interaction with Steam's login page. Connect while signed into RGBoner, refresh, let automatic matching and importing finish without clicking an import control. Reopen a saved partially matched collection and confirm it resumes automatically. Check a collection larger than 40 games to exercise matching and larger than 30 to exercise bulk imports. Verify pause/resume, unresolved filters, live title search and its single outer focus ring, artwork fallbacks, and one-click resolution/import and platform management in the shared game dialog. Refresh an unchanged library and confirm that the message does not claim matching is in progress. Repeat an import and confirm existing progress is unchanged. Check a private library, separately hidden playtime, a missing catalog match, a catalog match without supported platforms, disconnect/reconnect, and a failed upstream request. Never substitute a manually entered SteamID for real account verification in production. Check Borderlands 2 VR appears in the Steam matcher and imports as SteamVR; unsupported console/standalone VR platforms remain excluded. Check Recently updated after an import and platform edit; a no-op edit or playtime refresh must not change ordering. Test fixtures belong only to AgentTester's local data. No test should require or log real Steam credentials.
