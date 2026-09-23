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
Browser UI -> /api/challenges   -> db/index.ts -> Cloudflare D1
Browser -> /search, /users, and /users/:id -> db/index.ts -> Cloudflare D1
Browser -> /profile -> db/index.ts -> Cloudflare D1
```

The app uses Next.js App Router components through Vinext, Vite, and the Cloudflare runtime. `app/page.tsx` is dynamically rendered and passes the signed-in identity to the client component in `app/library.tsx`. The shared header in `app/site-header.tsx` submits searches to `/search?q=...` from every app page and displays the RGBoner pixel wordmark, with red R, green G, and blue Boner. The results page fetches IGDB games, RGBoner players, and the current user's saved games independently; its All, Games, and Players filters keep those result types distinct. Players include private accounts, library visibility, and the current friendship state, but search responses omit their email addresses and library items. The library component loads saved games and received challenges. `/settings` controls account visibility and friend requests. `/users` lists public accounts and accepted friends. `/users/:id` renders another player's library and challenges only after checking public visibility or accepted friendship, and lets a viewer request friendship when needed. Friends can open a challenge form on each active library game. `/profile` shows the owner's received challenges in Pending and Completed sections, with favorites first and manual ordering within each section and favorite group; it also shows challenges they created, including declined submissions. `app/globals.css` contains the shared semantic color tokens and responsive styling for all these screens; [the visual style guide](style-guide.md) sets the design rules for future changes.

## Authentication and ownership

`app/chatgpt-auth.ts` reads identity from `oai-authenticated-user-id` and `oai-authenticated-user-email` request headers. It redirects unauthenticated page requests to `/signin-with-chatgpt` and returns 401 from API routes. The authentication boundary depends on the trusted hosting layer supplying these headers; the app does not independently verify a token.

For portable local development, `build/sites-vite-plugin.ts` simulates sign-in on localhost. It strips incoming identity headers before setting its own headers from a local sign-in cookie. The default simulated user has ID `local_seedy`; `?user=2` on the sign-in path selects `local_player2`. The simulation is disabled in the `managed-linux` execution profile.

Every owner library query includes the authenticated `userId`. Deletes match both the row ID and user ID. Other players' libraries and challenges are read by the server-rendered `/users/:id` page after an account visibility and friendship check; there is no separate unguarded public library or challenge API. Private is the database default. Pending requests do not grant access, and removing a friendship immediately revokes profile access on subsequent requests. Challenge creation requires an accepted friendship and an active library entry, even when the recipient's profile is public. Only the creator and recipient may change their own completion confirmations. Only the recipient may decline, favorite, or rank a challenge. Participants retain confirmation access through their own profile after a friendship ends or a game is removed. Write endpoints call `lib/request-security.ts` to reject a mismatched `Origin` header when one is present. Sign-in and sign-out return paths are limited to relative app paths.

## API

| Route | Behavior |
| --- | --- |
| `GET /api/igdb/search?q=...` | Search IGDB for 2–100 character queries; return up to 30 serialized games. Requires sign-in. |
| `GET /api/players/search?q=...` | Search existing RGBoner accounts by display name or email text for 2–100 character queries; return up to 30 other players with display label, library visibility, and friendship state. Private accounts are included, but email addresses and library items are omitted. Requires sign-in. |
| `GET /api/library` | Return the current user's saved games, newest first. Requires sign-in. |
| `POST /api/library` | Accept `{ "igdbId": number }`, fetch that game from IGDB on the server, and save its details. Duplicate user/game pairs are ignored by the unique index. Requires sign-in and same-origin write. |
| `DELETE /api/library/:id` | Remove one saved row belonging to the current user. Requires sign-in and same-origin write. |
| `GET /api/account` | Return the signed-in user's account visibility and friend/request lists. Creates an account with private visibility on first use. |
| `PATCH /api/account` | Accept `{ "isPublic": boolean }` to update only the current user's library visibility. Requires sign-in and same-origin write. |
| `GET /api/friends` | Return accepted friendships and pending incoming/outgoing requests. Requires sign-in. |
| `POST /api/friends` | Accept `{ "email": string }` or `{ "userId": string }` to request friendship with an existing RGBoner account. The latter supports search results and profiles without exposing the target email. Requires sign-in and same-origin write. |
| `PATCH /api/friends/:userId` | Accept `{ "action": "accept" }` for an incoming pending request. Requires sign-in and same-origin write. |
| `DELETE /api/friends/:userId` | Decline or cancel a pending request, or remove an accepted friendship. Requires sign-in and same-origin write. |
| `GET /api/challenges?scope=received\|sent` | Return only the signed-in player's received active challenges or created challenges, including those declined by recipients. Requires sign-in. |
| `POST /api/challenges` | Accept `{ "recipientId": string, "igdbId": number, "title": string, "description": string }`; require an accepted friendship and that the recipient currently has the game saved. Requires sign-in and same-origin write. |
| `PATCH /api/challenges/:id` | Accept `confirm`, `unconfirm`, `decline`, `favorite`, `unfavorite`, `move_up`, or `move_down`. A participant changes only their own confirmation; only the recipient can decline or rank. Requires sign-in and same-origin write. |

Search, library, account, friend, and challenge GET responses use `Cache-Control: private, no-store`. The browser never supplies the stored name, cover, year, or platforms: the library POST route loads those values from IGDB using the submitted ID. Challenge creation snapshots the name and cover from the recipient's saved game. Game and player search load separately so one source can still display results if the other fails. A fallback account display label uses the part before `@` rather than returning an email address in player search or profiles.

## External data and storage

`lib/igdb.ts` gets a Twitch client-credentials token using `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`, caches it in server memory until near expiry, and calls the IGDB games API. It converts IGDB cover IDs into image URLs and release timestamps into UTC years. Credentials stay server-side. Search results are transient; saved records hold a snapshot of IGDB details, so they do not update automatically when IGDB changes.

`db/schema.ts` defines `library_items`, `accounts`, `friendships`, and `challenges` in SQLite/D1. Account emails are normalized to lowercase for friend-request lookup, and public visibility defaults to false. A friendship row stores an ordered user pair, the requester, and `pending` or `accepted` status. A challenge is keyed to recipient and IGDB game rather than to a removable library row. Its game snapshot keeps historical entries readable after removal; if the game is saved again, its challenge list reappears. The challenge is completed only while both confirmation flags are true. Either participant can undo their own confirmation. Declining hides the challenge from the recipient's profile and game list while keeping a Declined record on the creator's profile. The library stores one entry per IGDB game, and `platforms_json` is catalog metadata rather than an owned-platform selection. `db/index.ts` obtains the `DB` Cloudflare binding and creates a Drizzle client. Drizzle migrations live in `drizzle/`; apply `0000`, `0001`, then `0002` on an empty database, or only unapplied migrations on an existing database. `.openai/hosting.json` declares the D1 binding name, while `vite.config.ts` supplies a local D1 binding for development.

## Where to make changes

| Change | Start with |
| --- | --- |
| Page layout or interaction | `app/site-header.tsx`, `app/search/`, `app/library.tsx`, `app/globals.css` |
| API behavior | `app/api/` and its helpers in `lib/` |
| Identity or redirects | `app/chatgpt-auth.ts`, then local simulation in `build/sites-vite-plugin.ts` if needed |
| Stored fields | `db/schema.ts`, `drizzle/`, and library API serialization |
| Runtime bindings or build | `.openai/hosting.json`, `vite.config.ts`, `scripts/` |
