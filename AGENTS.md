# Working on RGBoner

Read [README.md](README.md), [docs/development.md](docs/development.md), and [docs/architecture.md](docs/architecture.md) before changing behavior or setup. The implementation remains the source of truth when documentation and code disagree.

Before any visual or styling change, read [docs/style-guide.md](docs/style-guide.md) and inspect the current wordmark in `app/site-header.tsx` and favicon in `public/favicon.svg`. Follow the guide's brand, imagery, accessibility, and review rules. Preserve the logo's glyphs and RGB colors unless the user explicitly requests a brand change. Keep the guide current when visual decisions change.

## Authorization and role privacy

Admins have every application permission. Use `lib/permissions.ts` for all new server-side permission checks so admin access bypasses ordinary ownership, privacy, friendship, and participant restrictions. Authentication, same-origin writes, input validation, verified-account eligibility, and database integrity still apply. Roles come only from the authenticated account's `account_roles` row, loaded by `app/auth.ts` on each request. Read [roles and permissions](docs/architecture.md#roles-and-permissions) before adding authorization or admin-specific behavior.

Never expose another player's role in public responses or UI, add admin badges or special styling, or add an admin management UI or role mutation endpoint. Admins can view private profiles and still use the ordinary friend button; role access must not create a friendship. Grants and revocations require explicitly authorized, trusted D1 operations, as documented in [development](docs/development.md#roles-and-trusted-administration).

## Key locations

- `app/library.tsx`: client-side search and collection UI.
- `app/api/`: authenticated search and collection endpoints.
- `app/chatgpt-auth.ts`: user header parsing and sign-in redirects.
- `lib/igdb.ts`: server-side Twitch token and IGDB access.
- `db/schema.ts` and `drizzle/`: D1 schema and migrations.
- `vite.config.ts`, `build/sites-vite-plugin.ts`, and `.openai/hosting.json`: local runtime, simulated sign-in, and hosting binding configuration.

## Local run commands

- For local preview, refresh, restart, or “redeploy locally” requests, use `npm run dev` and the documented URL `http://localhost:5173/`.
- `npm run build` followed by `npm run start` serves the built Worker through local Wrangler. Use that runner only when the user explicitly asks to run the built Worker; do not infer it from “redeploy locally.”
- If a local server is already running, reuse or restart the project’s dev server rather than starting a second runner.

## Keep the docs current

For every completed app change, update the relevant documentation in the same change so it describes the app's current behavior and setup. Add new explanations where needed, revise outdated ones, and remove instructions that no longer apply. Keep `README.md` as the entry point, `docs/development.md` as the setup and database guide, and `docs/architecture.md` as the behavior and API guide. Do not add dated change entries; Git records history.

Add migrations for schema changes and document how to apply them. Keep secrets out of documentation and browser code. Do not edit generated `dist/`, `.next/`, `.vinext/`, or `.wrangler/` output as source. A change is complete only after its documentation is accurate.
