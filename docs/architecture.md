# Architecture

## Request flow

```text
Browser -> app/page.tsx -> app/library.tsx when signed in
                        |
                        +-> /search when signed out
Browser -> /search -> public game and player search

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

The app uses Next.js App Router components through Vinext, Vite, and the Cloudflare runtime. `app/page.tsx` is dynamically rendered and passes the signed-in identity to the client component in `app/library.tsx`. In-app route links use native anchors and full document navigation because the current production Vinext bundle fails during client-side link prefetch and navigation; forms and on-page interactions still use client-side React. The shared header in `app/site-header.tsx` submits searches to `/search?q=...` from every app page and displays the RGBoner pixel wordmark, with red R, green G, and blue Boner. The results page fetches IGDB games and RGBoner players independently, and fetches saved games only for signed-in players; its All, Games, and Players filters keep those result types distinct. Players include private accounts, library visibility, and the current friendship state, but search responses omit their email addresses and library items. The library component loads saved games and received challenges. `/settings` controls account visibility and friend requests. `/users` lists public accounts and accepted friends. `/users/:id` renders another player's library and challenges only after checking public visibility or accepted friendship, and lets a viewer request friendship when needed. Friends can open a challenge form on each active library game. `/profile` shows the owner's received challenges in Pending and Completed sections, with favorites first and manual ordering within each section and favorite group; it also shows challenges they created, including declined submissions. `app/globals.css` contains the shared semantic color tokens and responsive styling for all these screens; [the visual style guide](style-guide.md) sets the design rules for future changes.

## Authentication and ownership

`app/auth.ts` reads an HTTP-only session cookie, hashes its random token, and looks up an unexpired session in D1. Protected pages redirect unauthenticated visitors to `/login`, and protected APIs return 401. `/search` and its game and player search APIs are public. `POST /api/auth/register` creates a pending account with a salted PBKDF2-SHA-256 password hash and emails a 24-hour verification link. The link opens a confirmation page; a same-origin POST consumes its hashed, single-use token and then issues a session. Unverified accounts cannot sign in, appear in player search, or receive friend requests. `POST /api/auth/login` verifies the password and issues a 30-day session. It limits failed attempts for each email address to 10 per 15-minute window. `POST /api/auth/logout` revokes that session and clears the cookie. A reset request emails a 30-minute link; using it changes the password and revokes all existing sessions. Link requests are limited to one per account and purpose per minute, and reset responses do not reveal whether an account exists. The cookie uses `SameSite=Lax`, `HttpOnly`, and `Secure` on HTTPS. Passwords and raw session tokens are never stored in D1.

The email account index applies only to rows with a password hash. Older ChatGPT-based account rows remain in D1, but they cannot sign in and are excluded from player search, profiles, and friend requests. A fresh email account may use the same address without inheriting old data. `lib/auth-email.ts` sends verification and reset links through the Resend HTTP API, using server-side `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and `AUTH_PUBLIC_URL`. Local console delivery works only for localhost. The local Vite plugin no longer simulates ChatGPT identity.

Every owner library query includes the authenticated `userId`. Deletes match both the row ID and user ID. Other players' libraries and challenges are read by the server-rendered `/users/:id` page after an account visibility and friendship check; there is no separate unguarded public library or challenge API. Private is the database default. Pending requests do not grant access, and removing a friendship immediately revokes profile access on subsequent requests. Challenge creation requires an accepted friendship and an active library entry, even when the recipient's profile is public. Only the creator and recipient may change their own completion confirmations. Only the recipient may decline, favorite, or rank a challenge. Participants retain confirmation access through their own profile after a friendship ends or a game is removed. Write endpoints call `lib/request-security.ts` to reject a mismatched `Origin` header when one is present. Login return paths are limited to relative app paths.

## API

| Route | Behavior |
| --- | --- |
| `POST /api/auth/register` | Create a pending email account and send a verification link; no session until verified. Same-origin write. |
| `POST /api/auth/login` | Verify email and password and issue a session. Same-origin write. |
| `POST /api/auth/verify` | Consume a single-use verification token and issue a session. Same-origin write. |
| `POST /api/auth/resend-verification` | Send a new link for an unverified account, at most once per minute. Same-origin write. |
| `POST /api/auth/request-reset` | Send a password reset link for a verified account, at most once per minute. Same-origin write. |
| `POST /api/auth/reset-password` | Consume a single-use token, change the password, and revoke sessions. Same-origin write. |
| `POST /api/auth/logout` | Revoke the current session and clear the cookie. Same-origin write. |
| `GET /api/igdb/search?q=...` | Public IGDB search for 2–100 character queries; return up to 30 serialized games. |
| `GET /api/players/search?q=...` | Search existing RGBoner accounts by display name or email text for 2–100 character queries; return up to 30 other players with display label, library visibility, and friendship state. Private accounts are included, but email addresses and library items are omitted. Visitors can match display names; email-text matching and friendship state require sign-in. |
| `GET /api/library` | Return the current user's saved games, newest first. Requires sign-in. |
| `POST /api/library` | Accept `{ "igdbId": number }`, fetch that game from IGDB on the server, and save its details. Duplicate user/game pairs are ignored by the unique index. Requires sign-in and same-origin write. |
| `DELETE /api/library/:id` | Remove one saved row belonging to the current user. Requires sign-in and same-origin write. |
| `GET /api/account` | Return the signed-in user's account visibility and friend/request lists. Accounts are created at registration with private visibility. |
| `PATCH /api/account` | Accept `{ "isPublic": boolean }` to update only the current user's library visibility. Requires sign-in and same-origin write. |
| `GET /api/friends` | Return accepted friendships and pending incoming/outgoing requests. Requires sign-in. |
| `POST /api/friends` | Accept `{ "email": string }` or `{ "userId": string }` to request friendship with an existing RGBoner account. The latter supports search results and profiles without exposing the target email. Requires sign-in and same-origin write. |
| `PATCH /api/friends/:userId` | Accept `{ "action": "accept" }` for an incoming pending request. Requires sign-in and same-origin write. |
| `DELETE /api/friends/:userId` | Decline or cancel a pending request, or remove an accepted friendship. Requires sign-in and same-origin write. |
| `GET /api/challenges?scope=received\|sent` | Return only the signed-in player's received active challenges or created challenges, including those declined by recipients. Requires sign-in. |
| `POST /api/challenges` | Accept `{ "recipientId": string, "igdbId": number, "title": string, "description": string }`; require an accepted friendship and that the recipient currently has the game saved. Requires sign-in and same-origin write. |
| `PATCH /api/challenges/:id` | Accept `confirm`, `unconfirm`, `decline`, `favorite`, `unfavorite`, `move_up`, or `move_down`. A participant changes only their own confirmation; only the recipient can decline or rank. Requires sign-in and same-origin write. |

Search, library, account, friend, and challenge GET responses use `Cache-Control: private, no-store`. The search page and read-only search APIs allow guests; write endpoints for saved games and friendships still require a session. The browser never supplies the stored name, cover, year, or platforms: the library POST route loads those values from IGDB using the submitted ID. Challenge creation snapshots the name and cover from the recipient's saved game. Game and player search load separately so one source can still display results if the other fails. A fallback account display label uses the part before `@` rather than returning an email address in player search or profiles.

## External data and storage

`lib/igdb.ts` gets a Twitch client-credentials token using `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`, caches it in server memory until near expiry, and calls the IGDB games API. It converts IGDB cover IDs into image URLs and release timestamps into UTC years. Credentials stay server-side. Search results are transient; saved records hold a snapshot of IGDB details, so they do not update automatically when IGDB changes.

`db/schema.ts` defines `library_items`, `accounts`, `sessions`, `login_attempts`, `auth_tokens`, `friendships`, and `challenges` in SQLite/D1. Account emails are normalized to lowercase for friend-request lookup, and public visibility defaults to false. A friendship row stores an ordered user pair, the requester, and `pending` or `accepted` status. A challenge is keyed to recipient and IGDB game rather than to a removable library row. Its game snapshot keeps historical entries readable after removal; if the game is saved again, its challenge list reappears. The challenge is completed only while both confirmation flags are true. Either participant can undo their own confirmation. Declining hides the challenge from the recipient's profile and game list while keeping a Declined record on the creator's profile. The library stores one entry per IGDB game, and `platforms_json` is catalog metadata rather than an owned-platform selection. `db/index.ts` obtains the `DB` Cloudflare binding and creates a Drizzle client. Drizzle migrations live in `drizzle/`; apply `0000` through `0005` on an empty database, or only unapplied migrations on an existing database. `.openai/hosting.json` declares the D1 binding name, while `vite.config.ts` supplies a local D1 binding for development.

## Where to make changes

| Change | Start with |
| --- | --- |
| Page layout or interaction | `app/site-header.tsx`, `app/search/`, `app/library.tsx`, `app/globals.css` |
| API behavior | `app/api/` and its helpers in `lib/` |
| Identity or redirects | `app/auth.ts`, `app/login/`, and `app/api/auth/` |
| Stored fields | `db/schema.ts`, `drizzle/`, and library API serialization |
| Runtime bindings or build | `.openai/hosting.json`, `vite.config.ts`, `scripts/` |
