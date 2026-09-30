# Coding conventions

These are the patterns the existing code already follows. New code should look like it was written by the same author. When a pattern here is wrong for a task, raise it with the user before diverging, and update this file if the pattern changes. Visual rules live in the [style guide](style-guide.md); behavior lives in [architecture](architecture.md).

## Where code lives

| Path | Holds |
| --- | --- |
| `app/**/page.tsx` | Server components: authenticate, load data, render. Always `export const dynamic = "force-dynamic";`. |
| `app/*.tsx` | Shared components. Client components start with `"use client";`. Server-safe ones (such as `profile-nameplate.tsx`) do not. |
| `app/api/**/route.ts` | HTTP handlers. Thin: authenticate, validate, call `lib/`, serialize. |
| `app/auth.ts` | Sessions, passwords, `getCurrentUser()`, `requireUser(returnTo)`. |
| `lib/email.ts`, `lib/email-messages.ts` | Outgoing email delivery and message content; see [Email](#email). |
| `lib/` | Server logic and data access. Pure functions (no DB, no `cloudflare:workers`) go in their own module so tests can import them. |
| `lib/*-queries.ts` | Raw SQL strings that must be atomic, imported by routes and tested against real migrations. |
| `db/schema.ts`, `drizzle/` | Drizzle schema and generated SQL migrations. |
| `app/globals.css` | All site styling, organized by feature with a one-line comment heading each block. |
| `tests/*.test.ts` | `node:test` unit tests for `lib/` logic and SQL. |
| `components/ui/`, `hooks/` | Vendored shadcn files. Unused by the site; do not edit or import them without asking. |

## Language and formatting

- TypeScript strict mode. Prefer inferred types; declare `type` aliases (not `interface`) next to the code that uses them, and export shared ones from `lib/` (for example `lib/game-types.ts`).
- Double quotes, semicolons, two-space indentation. There is no formatter; match the density of the surrounding file. Short guards, `try`/`catch`, and JSX elements stay on one line when they fit the neighboring style. Never reformat code you are not changing.
- Relative imports (`../../lib/social`), not the `@/` alias. Tests import with the `.ts` extension.
- Names: `kebab-case` files, `PascalCase` components, `camelCase` functions and values, `snake_case` SQL columns mapped to `camelCase` in Drizzle.
- Comments explain why, not what: a constraint, a runtime bug, a security reason. One or two lines, directly above the code.

## Pages

- Start with `const user = await requireUser("/this/path");` (or `getCurrentUser()` for guest-visible pages), then `ensureAccount(user)` when the page needs the account row.
- Load data in parallel with `Promise.all`, and read another player's data only after `canViewProfile` allows it.
- Pass serializable props to client components: plain objects, never `AppUser`, never another player's role or email. Pass capability booleans (`canManage`, `canCreateChallenges`) computed with `hasPermission`.
- Render `<main className="library-page"><SiteHeader email={user.email}/><div className="library-wrap …">…</div></main>`.

## API routes

Follow this order in every handler; see `app/api/game-favorites/route.ts` for a complete example.

```ts
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to …" }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  // Narrow `payload` by hand with typeof / Number.isSafeInteger checks; 400 with a user-facing message.
  try {
    // Load the resource (404), check hasPermission(user, ordinarilyAllowed) (403), write, re-read.
    return Response.json({ updatedState }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not … Please try again." }, { status: 503 }); }
}
```

- Every response is `Response.json`. Errors are `{ error: string }` written as a sentence a player can act on. Status codes: 400 invalid input, 401 signed out, 403 origin or permission, 404 missing, 409 conflict or limit, 503 unexpected failure.
- Personal GET and write responses send `privateResponse` (`Cache-Control: private, no-store`).
- Mutations return the fresh state the client needs (for example the whole favorites list), so the client replaces its state instead of patching it.
- Do not leak exception details to the browser. Log with `console.error("<METHOD> <route> failed", …)` only where server diagnosis needs it, and never log bodies or credentials.
- Dynamic segments: `type Context = { params: Promise<{ id: string }> }`, then parse and validate the ID.

## Data access

- `getDb()` from `db/index.ts` returns Drizzle over the `DB` binding. Use the query builder for ordinary reads and writes.
- When a write must be atomic under concurrency (limits, reordering, conditional timestamps), write one SQL statement in `lib/*-queries.ts`, run it with `db.$client.prepare(sql).bind(…).run()`, and test it in `tests/` against the real migrations using `node:sqlite` (see `tests/game-favorites.test.ts`).
- Timestamps are Unix milliseconds (`Date.now()`). Booleans use Drizzle `{ mode: "boolean" }`.
- Stored game details are snapshots loaded from IGDB on the server by ID.
- Batch `inArray` lookups in chunks of 400 IDs (see `lib/challenges.ts`).
- Schema changes: edit `db/schema.ts`, run `npm run db:generate`, review the SQL, and document the migration in `docs/development.md` and `docs/deployment.md`.

## Email

All outgoing email goes through `sendEmail(request, { to, subject, text })` in `lib/email.ts`, which posts to the Resend HTTP API with the server-side `RESEND_API_KEY` and `AUTH_EMAIL_FROM`. Never call Resend (or any other mail service) directly from a route or component. To add a new kind of email:

1. Write a pure builder in `lib/email-messages.ts` that returns an `EmailMessage` (see `friendRequestEmail`), and test its subject and links in `tests/email-messages.test.ts`. Keep the wording in that module; routes only pass data in. Token emails whose content depends on a stored secret, such as verification and password reset in `lib/auth-email.ts`, build their text beside the token logic instead.
2. Build every link with `new URL(path, publicOrigin(request))`. `publicOrigin` returns the configured `AUTH_PUBLIC_URL` in production and the local origin on localhost, so links never trust the request's Host header.
3. Send from the route after the database write succeeds. Look up the recipient's address on the server by account ID; never accept an address, name, or link text for the message from the client.
4. Messages are plain text. Name other players only by display name and profile link: never include another player's email, role, or private data. Use a subject and first line that say who did what, then the link, then what to do if the email was unexpected.
5. Decide what a delivery failure means. When the email *is* the feature (verification, reset), let the error reach the route's `catch` so the player sees a 503, and call `assertEmailDeliveryReady(request)` before writing anything that depends on the email. When the email only notifies about a saved change (friend requests), wrap `sendEmail` in its own `try`/`catch`, `console.error` the message (not the email address or body), and still return success.
6. Think about repeat sends. Anything a player can trigger over and over at another player's inbox needs a limit or a reason it cannot be abused; auth links use `recentlyIssued` for one per minute per account.
7. Document the new email in `docs/architecture.md` (the behavior and its API row) and in the QA step of `docs/deployment.md`.

Locally, `AUTH_EMAIL_MODE=console` in `.dev.vars` makes `sendEmail` print the recipient, subject, and full text to the dev server log instead of sending. It only works on `localhost`/`127.0.0.1`; hosted requests always use Resend.

## Client components

- `useState` for state; no global stores, context providers, or data-fetching libraries.
- Fetch with a small local helper that throws `new Error(result.error || "…")` on non-OK responses, and show the message inline (`notice error`, `challenge-error`) with `role="alert"`.
- Track `busy` to disable controls during a request. After a mutation, replace state with the server's response; `window.location.reload()` is acceptable where the server recomputes ordering.
- Modals use native `<dialog>` with `showModal()` in an effect and close on unmount (see `ChallengeDetailsDialog`).
- Links between pages are plain `<a href>`, not `next/link` (see settled decisions).
- Icons come from `lucide-react`. Decorative icons get `aria-hidden="true"`; icon-only buttons get an `aria-label` and a `title`.
- Every interactive element is keyboard reachable with a visible focus state. When one element duplicates another for pointer users (such as the Top 10 shelf caption), hide the duplicate from assistive technology and the tab order instead of exposing two.

## Styling

- Write semantic, feature-prefixed classes in `app/globals.css` (`.shelf-book`, `.trophy-cover`), not Tailwind utility classes or inline styles. Tailwind supplies the preflight reset and the `antialiased` class on `<body>`; nothing else.
- Use the `--rgb-*` tokens from the style guide; do not add one-off colors or sizes. Brand red, green, and blue appear only in the logo, favicon, and the small RGB bar.
- Monospace (`ui-monospace, …`) is for short labels, counters, and section markers; everything else uses the Arial/Helvetica stack.
- Put responsive overrides in the feature's own `@media` block at the end of that feature's section. Check 320px width.
- Add CSS next to the feature's existing block and delete rules that no longer match any markup.

## Testing

- `npm test` runs `node --experimental-strip-types --test tests/*.test.ts`. Tests use `node:test` and `node:assert/strict`, with no extra framework.
- Extract logic you want to test into a pure `lib/` module (see `lib/timeline-items.ts`, `lib/permissions.ts`).
- UI has no automated tests. Verify UI changes by running the app and checking the style guide's review list, and say so in your summary.

## Settled decisions

These were chosen deliberately. Do not undo them without the user's approval; architecture explains each in more detail.

- Admins have every permission through `lib/permissions.ts`, and admin status is never visible to other players.
- Profiles are private by default. Pending friend requests grant nothing.
- Native anchors instead of `next/link`: the current Vinext production bundle breaks client-side navigation.
- The friends timeline is computed on read from current records. There is no activity table, queue, or notification system.
- Every feature where a player adds, chooses, or finishes something with its own timestamp gets a timeline entry in the same change (see [timeline design](timeline-design.md#what-belongs-in-the-timeline)).
- Challenges belong to the recipient and IGDB game, not to a library row, so removing a game keeps its challenges.
- Library entries are one row per game and platform. Currently playing is a mark on a platform copy (`playing_since`), so only owned copies qualify and there is no limit. Favorites are independent of library copies and capped at ten (`favoriteLimit` in `lib/game-favorite-queries.ts`). The Hall of Honor holds at most six starred completed challenges (`honorLimit` in `lib/challenge-queries.ts`).
- Game artwork keeps its proportions (`object-fit: contain` on black) and is never tinted or given CRT effects.
- Documentation describes the current state. History lives in Git commits, not in dated notes or state files.
