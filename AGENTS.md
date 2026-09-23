# Working on RGBoner

Read [README.md](README.md), [docs/development.md](docs/development.md), and [docs/architecture.md](docs/architecture.md) before changing behavior or setup. The implementation remains the source of truth when documentation and code disagree.

Before any visual or styling change, read [docs/style-guide.md](docs/style-guide.md) and inspect the current wordmark in `app/site-header.tsx` and favicon in `public/favicon.svg`. Follow the guide's brand, imagery, accessibility, and review rules. Preserve the logo's glyphs and RGB colors unless the user explicitly requests a brand change. Keep the guide current when visual decisions change.

## Key locations

- `app/library.tsx`: client-side search and collection UI.
- `app/api/`: authenticated search and collection endpoints.
- `app/chatgpt-auth.ts`: user header parsing and sign-in redirects.
- `lib/igdb.ts`: server-side Twitch token and IGDB access.
- `db/schema.ts` and `drizzle/`: D1 schema and migrations.
- `vite.config.ts`, `build/sites-vite-plugin.ts`, and `.openai/hosting.json`: local runtime, simulated sign-in, and hosting binding configuration.

## Keep the docs current

For every completed app change, update the relevant documentation in the same change so it describes the app's current behavior and setup. Add new explanations where needed, revise outdated ones, and remove instructions that no longer apply. Keep `README.md` as the entry point, `docs/development.md` as the setup and database guide, and `docs/architecture.md` as the behavior and API guide. Do not add dated change entries; Git records history.

Add migrations for schema changes and document how to apply them. Keep secrets out of documentation and browser code. Do not edit generated `dist/`, `.next/`, `.vinext/`, or `.wrangler/` output as source. A change is complete only after its documentation is accurate.
