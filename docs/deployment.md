# Deploy RGBoner with Sites

This runbook covers publishing this repository as a ChatGPT Site. It is a Vinext/Cloudflare Worker app with a Sites-managed D1 database. Use [Development and setup](development.md) for local preview and local database commands, and [Architecture](architecture.md) for the app's authentication and data model. The [Sites guide](https://learn.chatgpt.com/docs/sites) describes the current Sites product workflow.

## What the deployment needs

- A Sites-enabled account or workspace with permission to create and publish Sites. Public publishing, external invitations, and custom domains depend on the account and workspace settings. Check the current Sites beta limits against the expected traffic and storage needs.
- Node.js 22.13 or newer and the locked npm dependencies for local checks and the Worker build.
- A Twitch developer application's IGDB client ID and client secret. Configure both as **Site secrets** named `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`; the checked-in `.dev.vars.example` is only a local template.
- The logical D1 binding `DB` declared in [`.openai/hosting.json`](../.openai/hosting.json). Sites provisions and connects the hosted database. `r2` is `null` because this app has no file uploads.
- A decision about the Site's audience. New Sites start with owner-only access. Site access determines who can open RGBoner; the app's separate public/private account setting determines which signed-in players can see a player's profile and library.

If the manifest has no `project_id`, check whether RGBoner already exists in the selected Sites account or workspace before creating one. Reuse the existing Site if it does; otherwise create one Site and keep the returned `project_id` in `.openai/hosting.json`. Do not invent an ID or create a second Site merely because the local manifest lacks one.

## Prepare a release

1. Review the source changes intended for the release, including `db/schema.ts`, every new `drizzle/*.sql` file, and `drizzle/meta/`. Keep `.dev.vars`, `.env*`, tokens, and generated `.wrangler/`, `.vinext/`, `.next/`, and `dist/` output out of source control.
2. If the schema changed, run `npm run db:generate` before building. Review the generated SQL and commit the migration and matching Drizzle metadata with the schema change. Treat migrations already applied to a hosted database as immutable; add a new migration for later changes.
3. From the repository root, run:

   ```sh
   npm run install:ci
   npm run lint
   ./node_modules/.bin/tsc --noEmit --incremental false
   npm run build
   ```

4. Check that the build produced `dist/server/index.js`, `dist/.openai/hosting.json`, and `dist/.openai/drizzle/`. The build copies the checked-in migrations into the deployment artifact. Keep this as a Worker build; a static export cannot run the authenticated API routes or D1 access.
5. Review the proposed Site audience, the profile and challenge visibility rules, and any user-submitted challenge text before broad sharing. The app receives a Site-scoped user ID, email, and optionally a full name from Sign in with ChatGPT; it stores account emails and names, friendships, saved games, and challenge content in D1. Prepare visitor-facing privacy information and a support process appropriate for the intended audience. Review IGDB's terms for the planned public use of game metadata and covers. The [Sites guide](https://learn.chatgpt.com/docs/sites#understand-limits-and-unsupported-uses) says Sites does not support data or inference residency for deployed code, D1 data, artifacts, or logs.

The local database under `.wrangler/state` is separate from the hosted Site database. Local migration commands in [Development and setup](development.md#local-setup) affect only local D1. Do not switch those commands to `--remote`: this repository's local Wrangler config uses a placeholder database ID, while Sites owns the hosted D1 resource.

## Configure the Site

`npm run build` only creates local artifacts; it does not publish. Sites publishing is managed in ChatGPT or the Codex desktop app, not through a standalone Sites CLI. A useful request from this checkout is: “Publish RGBoner with Sites from the reviewed source. Reuse its existing Site if one is registered, preserve its current audience, include the checked-in D1 migrations, and report the successful deployment URL.” Set secret values through Site settings separately.

1. In Codex or ChatGPT Sites, select the existing RGBoner Site or ask Sites to publish this repository as a new Site. For an existing Site, keep its `project_id` and current audience. For a new Site, register it once and save the returned `project_id` in `.openai/hosting.json` before preparing the release source.
2. In the Site's settings, add `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` as secret runtime values. Do not place their values in the manifest, source files, a prompt, or the deployed browser bundle. If a secret changes after deployment, deploy a saved version again so the new runtime revision takes effect.
3. Keep access restricted while checking the first deployment. Expand the audience through Sites sharing controls only when the intended visitors can sign in and the application behavior has been reviewed. A public Sites audience does **not** make RGBoner's private player profiles public.

Sites owns source preparation and deployment. For local source, it associates a saved version with the exact source commit and build artifact. A saved version is a reviewable candidate; deploying that version publishes it to the selected audience. Every deployment URL is a production URL, including one with owner-only access. Ask Sites to save without deploying when you need a candidate but do not want to update the live Site.

## Production D1 migrations

The repository's migration order is:

1. `drizzle/0000_marvelous_wolverine.sql` — library items.
2. `drizzle/0001_bored_rage.sql` — accounts and friendships.
3. `drizzle/0002_brave_wallop.sql` — challenges.

When a Sites version containing new Drizzle migrations is published, Sites applies and records each pending migration against its hosted D1 database **before** uploading the Worker. No separate hosted `wrangler d1 execute` command is part of this repository's Sites release flow. A new Site starts with an empty hosted database; publishing does not copy local `.wrangler/state` records into it.

Review every new migration for complete, D1-compatible, bounded schema statements. Avoid seed data or large backfills in migration files. Plan schema changes so the previous live Worker can tolerate a migration that lands before its replacement. A failed publish can leave some migrations applied even if the new Worker never becomes live. Inspect the deployment failure and migration state before retrying; do not replay an applied migration or rewrite its SQL or metadata. If Sites reports a deterministic `SQLITE_*` error for a specifically failed, unapplied migration, correct that unapplied migration and publish a new version. If the applied boundary is unclear, stop and establish it before making another schema change.

## Publish and verify

1. Save the release version from the reviewed source and build. Confirm it is associated with the intended source commit and includes the Worker and migration files.
2. Deploy the saved version with the intended Site audience. Wait for a **succeeded** deployment and use the URL returned by Sites; a pending or building status is not a completed release.
3. Open the live URL as an intended visitor. Verify Sign in with ChatGPT returns to RGBoner, the header identity is present, and account creation works. The portable local sign-in cookie is never used in production.
4. Search for a game to confirm the IGDB secrets work. Save and reload a game to confirm hosted D1 persistence. With two permitted signed-in accounts, check a friend request, private-profile access, challenge creation, each participant's completion confirmation, and decline behavior. Use disposable records for this smoke test.
5. Check that an uninvited visitor is blocked when the Site is restricted. If the Site is public, verify that a signed-out visitor reaches the app's sign-in flow and that another signed-in player still cannot see a private profile without an accepted friendship.
6. Inspect Sites deployment status and Worker logs if any step fails. Missing `DB` or missing-table errors point to the binding or migration stage; IGDB failures point to the runtime secret values or upstream service; unexpected 401s point to the Sites sign-in/header path.

RGBoner requires both `oai-authenticated-user-id` and `oai-authenticated-user-email` from the trusted Sites layer. All app pages and APIs require sign-in. Sites audience access and app-level friendships are separate checks. Public Site access alone does not grant a visitor access to another player's private library or challenges.

## Updates and recovery

- For later releases, review and build the changed source, append any new migrations, save a new version, and deploy it to the same Site. Do not create a replacement Site for routine updates.
- Changing Site secrets requires another deployment of an approved saved version. Changing the Site's sharing audience does not change any player's `is_public` setting in D1.
- To recover from a Worker regression, deploy an earlier compatible saved version. This changes code, **not** D1 data or migration history; first check that the old code can run against the current schema. Repair schema problems with a new forward migration and a new version. Plan data backup and restore separately before any destructive schema or data operation.
- Use the Site's deployment status, settings, database view, and Worker logs to diagnose production issues. Keep production records and local test data separate.

For current Sites controls, version behavior, access options, and limits, consult the [Sites developer guide](https://learn.chatgpt.com/docs/sites) and [Creating and managing ChatGPT Sites](https://help.openai.com/en/articles/20001339-creating-and-managing-chatgpt-sites).
