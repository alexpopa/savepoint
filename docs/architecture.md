# Architecture

## Request flow

```text
Browser -> app/page.tsx -> requireChatGPTUser() -> app/library.tsx
                                      |
                                      +-> sign-in redirect when no user

Browser UI -> /api/igdb/search -> lib/igdb.ts -> Twitch token + IGDB games API
Browser UI -> /api/players/search -> db/index.ts -> Cloudflare D1
Browser UI -> /api/library      -> db/index.ts -> Cloudflare D1
Browser UI -> /api/library/:id  -> db/index.ts -> Cloudflare D1
Browser UI -> /api/account      -> db/index.ts -> Cloudflare D1
Browser UI -> /api/friends      -> db/index.ts -> Cloudflare D1
Browser -> /search, /users, and /users/:id -> db/index.ts -> Cloudflare D1
```

The app uses Next.js App Router components through Vinext, Vite, and the Cloudflare runtime. `app/page.tsx` is dynamically rendered and passes the signed-in email to the client component in `app/library.tsx`. The shared header in `app/site-header.tsx` submits searches to `/search?q=...` from every app page. The results page fetches IGDB games, Savepoint players, and the current user's saved games independently; its All, Games, and Players filters keep those result types distinct. Players include private accounts, library visibility, and the current friendship state, but search responses omit their email addresses and library items. The library component loads saved games and calls the remove endpoint; the results page calls the add endpoint. `/settings` controls account visibility and friend requests. `/users` lists public accounts and accepted friends. `/users/:id` renders another player's library only after checking public visibility or accepted friendship, and lets a viewer request friendship when needed. `app/globals.css` contains the page styling.

## Authentication and ownership

`app/chatgpt-auth.ts` reads identity from `oai-authenticated-user-id` and `oai-authenticated-user-email` request headers. It redirects unauthenticated page requests to `/signin-with-chatgpt` and returns 401 from API routes. The authentication boundary depends on the trusted hosting layer supplying these headers; the app does not independently verify a token.

For portable local development, `build/sites-vite-plugin.ts` simulates sign-in on localhost. It strips incoming identity headers before setting its own headers from a local sign-in cookie. The default simulated user has ID `local_seedy`; `?user=2` on the sign-in path selects `local_player2`. The simulation is disabled in the `managed-linux` execution profile.

Every owner library query includes the authenticated `userId`. Deletes match both the row ID and user ID. Other players' libraries are read only by the server-rendered `/users/:id` page after an account visibility and friendship check; there is no separate unguarded public library API. Private is the database default. Pending requests do not grant access, and removing a friendship immediately revokes access on subsequent requests. Write endpoints call `lib/request-security.ts` to reject a mismatched `Origin` header when one is present. Sign-in and sign-out return paths are limited to relative app paths.

## API

| Route | Behavior |
| --- | --- |
| `GET /api/igdb/search?q=...` | Search IGDB for 2–100 character queries; return up to 30 serialized games. Requires sign-in. |
| `GET /api/players/search?q=...` | Search existing Savepoint accounts by display name or email text for 2–100 character queries; return up to 30 other players with display label, library visibility, and friendship state. Private accounts are included, but email addresses and library items are omitted. Requires sign-in. |
| `GET /api/library` | Return the current user's saved games, newest first. Requires sign-in. |
| `POST /api/library` | Accept `{ "igdbId": number }`, fetch that game from IGDB on the server, and save its details. Duplicate user/game pairs are ignored by the unique index. Requires sign-in and same-origin write. |
| `DELETE /api/library/:id` | Remove one saved row belonging to the current user. Requires sign-in and same-origin write. |
| `GET /api/account` | Return the signed-in user's account visibility and friend/request lists. Creates an account with private visibility on first use. |
| `PATCH /api/account` | Accept `{ "isPublic": boolean }` to update only the current user's library visibility. Requires sign-in and same-origin write. |
| `GET /api/friends` | Return accepted friendships and pending incoming/outgoing requests. Requires sign-in. |
| `POST /api/friends` | Accept `{ "email": string }` or `{ "userId": string }` to request friendship with an existing Savepoint account. The latter supports search results and profiles without exposing the target email. Requires sign-in and same-origin write. |
| `PATCH /api/friends/:userId` | Accept `{ "action": "accept" }` for an incoming pending request. Requires sign-in and same-origin write. |
| `DELETE /api/friends/:userId` | Decline or cancel a pending request, or remove an accepted friendship. Requires sign-in and same-origin write. |

Search, library, account, and friend GET responses use `Cache-Control: private, no-store`. The browser never supplies the stored name, cover, year, or platforms: the POST route loads those values from IGDB using the submitted ID. Game and player search load separately so one source can still display results if the other fails. A fallback account display label uses the part before `@` rather than returning an email address in player search or profiles.

## External data and storage

`lib/igdb.ts` gets a Twitch client-credentials token using `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`, caches it in server memory until near expiry, and calls the IGDB games API. It converts IGDB cover IDs into image URLs and release timestamps into UTC years. Credentials stay server-side. Search results are transient; saved records hold a snapshot of IGDB details, so they do not update automatically when IGDB changes.

`db/schema.ts` defines `library_items`, `accounts`, and `friendships` in SQLite/D1. Account emails are normalized to lowercase for friend-request lookup, and public visibility defaults to false. A friendship row stores an ordered user pair, the requester, and `pending` or `accepted` status. `db/index.ts` obtains the `DB` Cloudflare binding and creates a Drizzle client. Drizzle migrations live in `drizzle/`; apply `0000` then `0001` on an empty database, or only `0001` on a database that already has `0000`. `.openai/hosting.json` declares the D1 binding name, while `vite.config.ts` supplies a local D1 binding for development.

## Where to make changes

| Change | Start with |
| --- | --- |
| Page layout or interaction | `app/site-header.tsx`, `app/search/`, `app/library.tsx`, `app/globals.css` |
| API behavior | `app/api/` and its helpers in `lib/` |
| Identity or redirects | `app/chatgpt-auth.ts`, then local simulation in `build/sites-vite-plugin.ts` if needed |
| Stored fields | `db/schema.ts`, `drizzle/`, and library API serialization |
| Runtime bindings or build | `.openai/hosting.json`, `vite.config.ts`, `scripts/` |
