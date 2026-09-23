# Architecture

## Request flow

```text
Browser -> app/page.tsx -> requireChatGPTUser() -> app/library.tsx
                                      |
                                      +-> sign-in redirect when no user

Browser UI -> /api/igdb/search -> lib/igdb.ts -> Twitch token + IGDB games API
Browser UI -> /api/library      -> db/index.ts -> Cloudflare D1
Browser UI -> /api/library/:id  -> db/index.ts -> Cloudflare D1
```

The app uses Next.js App Router components through Vinext, Vite, and the Cloudflare runtime. `app/page.tsx` is dynamically rendered and passes the signed-in email and sign-out path to the client component in `app/library.tsx`. That component loads saved games, submits IGDB searches, and calls the add and remove endpoints. `app/globals.css` contains the page styling.

## Authentication and ownership

`app/chatgpt-auth.ts` reads identity from `oai-authenticated-user-id` and `oai-authenticated-user-email` request headers. It redirects unauthenticated page requests to `/signin-with-chatgpt` and returns 401 from API routes. The authentication boundary depends on the trusted hosting layer supplying these headers; the app does not independently verify a token.

For portable local development, `build/sites-vite-plugin.ts` simulates sign-in on localhost. It strips incoming identity headers before setting its own headers from a local sign-in cookie. The simulated user has the ID `local_seedy`. The simulation is disabled in the `managed-linux` execution profile.

Every library query includes the authenticated `userId`. Deletes match both the row ID and user ID. POST and DELETE also call `lib/request-security.ts` to reject a mismatched `Origin` header when one is present. Sign-in and sign-out return paths are limited to relative app paths.

## API

| Route | Behavior |
| --- | --- |
| `GET /api/igdb/search?q=...` | Search IGDB for 2–100 character queries; return up to 30 serialized games. Requires sign-in. |
| `GET /api/library` | Return the current user's saved games, newest first. Requires sign-in. |
| `POST /api/library` | Accept `{ "igdbId": number }`, fetch that game from IGDB on the server, and save its details. Duplicate user/game pairs are ignored by the unique index. Requires sign-in and same-origin write. |
| `DELETE /api/library/:id` | Remove one saved row belonging to the current user. Requires sign-in and same-origin write. |

Search and library GET responses use `Cache-Control: private, no-store`. The browser never supplies the stored name, cover, year, or platforms: the POST route loads those values from IGDB using the submitted ID.

## External data and storage

`lib/igdb.ts` gets a Twitch client-credentials token using `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`, caches it in server memory until near expiry, and calls the IGDB games API. It converts IGDB cover IDs into image URLs and release timestamps into UTC years. Credentials stay server-side. Search results are transient; saved records hold a snapshot of IGDB details, so they do not update automatically when IGDB changes.

`db/schema.ts` defines `library_items` in SQLite/D1. `db/index.ts` obtains the `DB` Cloudflare binding and creates a Drizzle client. Drizzle migrations live in `drizzle/`; the initial migration creates the table and the `(user_id, igdb_id)` unique index. `.openai/hosting.json` declares the D1 binding name, while `vite.config.ts` supplies a local D1 binding for development.

## Where to make changes

| Change | Start with |
| --- | --- |
| Page layout or interaction | `app/library.tsx`, `app/globals.css` |
| API behavior | `app/api/` and its helpers in `lib/` |
| Identity or redirects | `app/chatgpt-auth.ts`, then local simulation in `build/sites-vite-plugin.ts` if needed |
| Stored fields | `db/schema.ts`, `drizzle/`, and library API serialization |
| Runtime bindings or build | `.openai/hosting.json`, `vite.config.ts`, `scripts/` |
