# Working on Savepoint

Read [README.md](README.md), [docs/development.md](docs/development.md), and [docs/architecture.md](docs/architecture.md) before changing behavior or setup. The implementation remains the source of truth when documentation and code disagree.

## Key locations

- `app/library.tsx`: client-side search and collection UI.
- `app/api/`: authenticated search and collection endpoints.
- `app/chatgpt-auth.ts`: user header parsing and sign-in redirects.
- `lib/igdb.ts`: server-side Twitch token and IGDB access.
- `db/schema.ts` and `drizzle/`: D1 schema and migrations.
- `vite.config.ts`, `build/sites-vite-plugin.ts`, and `.openai/hosting.json`: local runtime, simulated sign-in, and hosting binding configuration.

## Keep the docs current

When changing an API, authentication rule, environment variable, database schema, local command, or hosting binding, update the relevant document in the same change. Add migrations for schema changes and document how to apply them. Keep secrets out of documentation and browser code. Do not edit generated `dist/`, `.next/`, `.vinext/`, or `.wrangler/` output as source.
