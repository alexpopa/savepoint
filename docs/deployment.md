# Deploy RGBoner with Sites

This runbook covers publishing the [`alexpopa/savepoint`](https://github.com/alexpopa/savepoint) repository as the RGBoner ChatGPT Site at [retrogameboner.com](https://retrogameboner.com). The local checkout directory may be named differently. For an existing Site, start at [Publish an update from the linked source](#publish-an-update-from-the-linked-source): **push GitHub first, then publish to Sites**. The Site is a Vinext/Cloudflare Worker app with a Sites-managed D1 database and its own email account system. Use [Development and setup](development.md) for local preview and local database commands, and [Architecture](architecture.md) for the app's authentication and data model. The [Sites guide](https://learn.chatgpt.com/docs/sites) describes the current Sites product workflow.

## What the deployment needs

- A Sites-enabled account or workspace with permission to create and publish Sites. Public publishing, external invitations, and custom domains depend on the account and workspace settings. Check the current Sites beta limits against the expected traffic and storage needs.
- Node.js 22.13 or newer and the locked npm dependencies for local checks and the Worker build.
- Optional Steam imports: configure `STEAM_API_KEY` as a Site secret and include both `0016_workable_millenium_guard.sql` (four Steam integration tables) and `0017_moaning_psylocke.sql` (library update timestamps and indexes). Migration `0017` is required for ordinary library use even without Steam configured. The existing HTTPS `AUTH_PUBLIC_URL` is the OpenID callback origin. Without the key, Steam linking and refresh are disabled; the rest of the site continues to work.
- Optional Xbox connections: configure `XBOX_CLIENT_ID`, `XBOX_CLIENT_SECRET`, and `XBOX_TOKEN_KEY` as Site secrets (see [Xbox production setup](#xbox-production-setup)). Migration `0018_sleepy_zuras.sql` adds the Xbox tables and is safe to apply without them.
- A Twitch developer application's IGDB client ID and client secret. Configure both as **Site secrets** named `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`; the checked-in `.dev.vars.example` is only a local template.
- A verified sending domain with Resend and a sending-access API key. Configure `RESEND_API_KEY` as a Site secret, `AUTH_EMAIL_FROM` as a sender on that domain, and `AUTH_PUBLIC_URL` as the exact HTTPS Site origin. See [Resend send email](https://resend.com/docs/api-reference/emails/send-email) and [verified domains](https://resend.com/docs/dashboard/domains/introduction).
- The logical D1 binding `DB` declared in [`.openai/hosting.json`](../.openai/hosting.json). Sites provisions and connects the hosted database. `r2` is `null` because this app has no file uploads.
- A public Site audience so signed-out visitors can reach RGBoner's email sign-in page without a ChatGPT account. The app's separate public/private account setting determines which signed-in players can see a player's profile and library.

If the manifest has no `project_id`, check whether RGBoner already exists in the selected Sites account or workspace before creating one. Reuse the existing Site if it does; otherwise create one Site and keep the returned `project_id` in `.openai/hosting.json`. Do not invent an ID or create a second Site merely because the local manifest lacks one.

## Xbox production setup

1. In the Azure portal, register an application for personal Microsoft accounts only, with the Web redirect URI `https://retrogameboner.com/api/xbox/callback`, and create a client secret. Before charging money or broad launch, complete publisher verification so the consent screen shows the publisher, and review Microsoft's terms for Xbox services.
2. Save `XBOX_CLIENT_ID`, `XBOX_CLIENT_SECRET`, and a new random 32-byte base64 `XBOX_TOKEN_KEY` as Site secrets. Keep the key stable: replacing it makes every stored Xbox sign-in unreadable. Rotate the client secret before it expires.
3. Publish the source with `0018` through the release sequence below.
4. For production QA, connect Xbox from a signed-in account on the canonical domain, refresh, add a game and one as playing, wait for achievements, check the profile section and a friend's timeline, then disconnect and confirm added games remain.

## Steam production setup

1. Register a user Web API key through [Steam's developer page](https://steamcommunity.com/dev/apikey), using `retrogameboner.com` for the domain. A publisher key is not required.
2. Save the key in the existing RGBoner Site's runtime settings as `STEAM_API_KEY`, marked as a secret. Keep it out of chat, source control, and the hosting manifest. Local `.dev.vars` is not uploaded to Sites.
3. Keep `AUTH_PUBLIC_URL=https://retrogameboner.com`. The app constructs the callback as `https://retrogameboner.com/api/steam/callback` with a per-attempt state parameter and the OpenID realm as `https://retrogameboner.com/`; no callback code change is needed for this domain.
4. Publish the source with both Steam migrations through the release sequence below. Saving a secret alone does not update the running Worker; deployment applies the runtime revision and pending migrations.
5. For production QA, connect Steam from a signed-in RGBoner account on the canonical domain, complete Steam verification, refresh/import, and reload to verify persistence. Check SteamVR matching and Recently updated after an import or platform change.

## Prepare a release

1. Review the source changes intended for the release, including `db/schema.ts`, every new `drizzle/*.sql` file, and `drizzle/meta/`. Keep `.dev.vars`, `.env*`, tokens, and generated `.wrangler/`, `.vinext/`, `.next/`, and `dist/` output out of source control.
2. If the schema changed, run `npm run db:generate` before building. Review the generated SQL and commit the migration and matching Drizzle metadata with the schema change. Treat migrations already applied to a hosted database as immutable; add a new migration for later changes.
3. After the GitHub push and Site source synchronization described below, run these commands in the Site source checkout:

   ```sh
   npm run install:ci
   npm run check
   npm run build
   ```

4. Check that the build produced `dist/server/index.js`, `dist/.openai/hosting.json`, and `dist/.openai/drizzle/`. The build copies the checked-in migrations into the deployment artifact. Keep this as a Worker build; a static export cannot run the authenticated API routes or D1 access. For a Sites release, run these commands in the Site source checkout that will be pushed and packaged, not in a different checkout.
5. Review the proposed Site audience, the profile and challenge visibility rules, and any user-submitted challenge text before broad sharing. The app stores account emails, display names, salted password hashes, hashed session tokens, friendships, saved games, and challenge content in D1. Email verification and password reset links are single-use and expire; unverified accounts cannot sign in. Prepare visitor-facing privacy information and a support process appropriate for the intended audience. Review IGDB's terms for the planned public use of game metadata and covers. The [Sites guide](https://learn.chatgpt.com/docs/sites#understand-limits-and-unsupported-uses) says Sites does not support data or inference residency for deployed code, D1 data, artifacts, or logs.

The local database under `.wrangler/state` is separate from the hosted Site database. Local migration commands in [Development and setup](development.md#local-setup) affect only local D1. Do not switch those commands to `--remote`: this repository's local Wrangler config uses a placeholder database ID, while Sites owns the hosted D1 resource.

## Configure the Site

`npm run build` only creates local artifacts; it does not publish. The [Sites guide](https://learn.chatgpt.com/docs/sites#understand-projects-versions-and-deployments) describes two separate publication steps: save a version associated with its source commit and build artifact, then deploy that saved version. Use the linked-source workflow below for this repository. Set secret values through Site settings separately.

1. In Codex or ChatGPT Sites, select the existing RGBoner Site or ask Sites to publish this repository as a new Site. For an existing Site, keep its `project_id` and current audience. For a new Site, register it once and save the returned `project_id` in `.openai/hosting.json` before preparing the release source.
2. In the Site's settings, add `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, and `RESEND_API_KEY` as secret runtime values. Set `AUTH_EMAIL_FROM` to the verified sender and `AUTH_PUBLIC_URL` to the HTTPS origin. Do not set `AUTH_EMAIL_MODE=console` on the hosted Site. Do not place their values in the manifest, source files, a prompt, or the deployed browser bundle. If a secret changes after deployment, deploy a saved version again so the new runtime revision takes effect.
3. Keep access restricted while checking the first deployment. Set the audience to public only when the email login flow and visitor-facing privacy information are ready and public access is intended. Preserve the current audience on subsequent releases unless a change is explicitly requested. A public Sites audience does **not** make RGBoner's private player profiles public.

Every deployment URL is a production URL, including one with owner-only access. Save a version without deploying when you need a candidate but do not want to update the live Site.

## Publish an update from the linked source

**Release order: push GitHub `main` → sync and package the Site source → save a Site version → deploy it.** GitHub and Sites have separate source repositories. A successful GitHub push alone does not update the live Site. If the Sites phase cannot proceed, report the GitHub commit as pushed and the Site as **not published**; resume later from that same commit.

1. Commit the reviewed changes on `main`. Verify that every `origin` push URL belongs to `alexpopa`, never `FMEX`/`fmex`, then push to GitHub `origin/main`. Record the pushed commit SHA and confirm `main` matches `origin/main`. If the intended commit is already pushed, reuse it without making another commit. Complete the GitHub phase before opening the Site checkout.
2. Find `sites:sites-hosting` in the session's **Available skills** list and read its listed `SKILL.md`. Its plugin root contains `scripts/site-workflow.mjs`; confirm that file and the native Sites tools are available. Use the listed skill path rather than a broad filesystem search. If a required capability is absent, report exactly what is missing and stop the Sites phase. A GitHub push or local build is not a Sites release.
3. Read `project_id` from `.openai/hosting.json`. Call Sites `get_site` for that exact ID, record its current audience, and obtain a source-repository write credential without automatic publish-on-push. The credential's remote and branch are authoritative; do not assume they match GitHub. Keep its token in memory and pass it to the workflow only through protected stdin, as the `sites-hosting` skill directs.
4. Create a **fresh, empty temporary directory outside this project checkout**. Start `site-workflow.mjs` there in opening mode, without `source` or `archivePath`. Retain its result as `source`. Confirm that `source.checkout_path` is a separate, clean checkout of the existing Site source and that its `.openai/hosting.json` has the same `project_id`. If any check fails, stop; do not build from the project checkout.
5. Compare that Site checkout with the exact GitHub commit pushed in step 1. Inspect Site-only files and differences; stop if any Site-only file has an unclear purpose. In the Site checkout, fetch the verified GitHub `main`, confirm `FETCH_HEAD` equals the recorded GitHub SHA, then run `git restore --source=FETCH_HEAD --staged --worktree :/`. Confirm `git write-tree` in the Site checkout equals the GitHub commit's tree hash (`git rev-parse <GitHub SHA>^{tree}`). This copies the source without merging histories. Stop on uncommitted Site changes, a project-ID mismatch, or a remote race. Never reset, rebase, or force-push the Site branch.
6. Run the workflow again with `source`, an absolute temporary `archivePath`, and the three preparation commands above, in order. It builds, commits and pushes the Site source, verifies the pushed commit, and packages the matching artifact. The Site commit SHA may differ from GitHub's; confirm its tree hash still equals the GitHub tree hash. Confirm the archive contains `dist/server/index.js`, `.openai/hosting.json`, and migrations. If only source synchronization was requested, stop here.
7. Call Sites `save_site_version` with the returned `project_id`, `commit_sha`, and archive. If only a saved candidate was requested, stop here. Otherwise deploy that saved version with the Site's existing audience and wait for a **succeeded** deployment. Report the URL returned by Sites.

The [Sites guide](https://learn.chatgpt.com/docs/sites#understand-projects-versions-and-deployments) explains the source-commit/version association. The installed `sites-hosting` skill owns the workflow invocation and current native tool schemas; use this runbook for RGBoner's release order and app-specific checks.

## Production D1 migrations

The repository's migration order is:

1. `drizzle/0000_marvelous_wolverine.sql` — library items.
2. `drizzle/0001_bored_rage.sql` — accounts and friendships.
3. `drizzle/0002_brave_wallop.sql` — challenges.
4. `drizzle/0003_bumpy_blink.sql` — email password hashes and sessions; retains earlier accounts as dormant records.
5. `drizzle/0004_exotic_morph.sql` — per-email sign-in attempt tracking.
6. `drizzle/0005_amusing_pretty_boy.sql` — email verification timestamp and expiring, hashed verification/reset tokens.
7. `drizzle/0006_tired_mister_fear.sql` — selected platform fields and unique `(user_id, igdb_id, platform_id)` library index; existing entries become “Platform not set” until edited.

8. `drizzle/0007_neat_retro_girl.sql` — unique email-account display names under ASCII case folding.
9. `drizzle/0008_steady_paladin.sql` — nullable challenge timeline timestamps; existing challenges enter the feed only after a visible state change.
10. `drizzle/0009_abandoned_kingpin.sql` — indexes for the recent popular games query.
11. `drizzle/0010_user_roles.sql` — account roles and the specifically authorized one-time admin grant to the verified production BlazeCloud account.

12. `drizzle/0011_silly_mongu.sql` — independent game favorites with unique player/game pairs, timestamps, and manual order.

13. `drizzle/0012_hard_terrax.sql` — nullable `playing_since` on library rows for currently playing; existing rows start unmarked.

14. `drizzle/0013_sparkling_serpent_society.sql` — game ratings (one 1–5 score per player and game) and nullable `completed_at` on library rows; existing rows start unrated and not completed.

15. `drizzle/0014_easy_kid_colt.sql` — per-player indexes on library additions, ratings, and the currently playing and completed marks (the latter two partial), so the friends timeline reads only friends' rows.

16. `drizzle/0015_solid_maestro.sql` — `messages` for direct messages between friends, with a `(user_low, user_high, id)` index for conversation pages and a partial `(recipient_id, sender_id)` index over unread rows.

17. `drizzle/0016_workable_millenium_guard.sql` — Steam connections, single-use link states, catalog mappings, and personal source games.

18. `drizzle/0017_moaning_psylocke.sql` — nullable library update timestamps and indexes for library updates and Steam source lookups, without backfilling existing rows.

19. `drizzle/0018_sleepy_zuras.sql` — Xbox connections, single-use link states, catalog mappings, played titles, shared achievement definitions, and per-player unlocks.

20. `drizzle/0019_calm_katie_power.sql` — a saved pause flag on Steam connections, defaulting to not paused.

21. `drizzle/0020_known_rhodey.sql` — the same saved pause flag on Xbox connections.

When a Sites version containing new Drizzle migrations is published, Sites applies and records each pending migration against its hosted D1 database **before** uploading the Worker. No separate hosted `wrangler d1 execute` command is part of this repository's Sites release flow. The local `db:migrate`, `db:status`, and `db:baseline` commands use Wrangler's local `d1_migrations` ledger only; they neither inspect nor update Sites' hosted history. The Drizzle journal describes source order, not deployment state. Never use a local baseline as evidence of production migration success. A new Site starts with an empty hosted database; publishing does not copy local `.wrangler/state` records into it.

Review every new migration for complete, D1-compatible, bounded schema statements. Avoid sample seed data or large backfills in migration files. `0010` is a narrowly targeted, explicitly authorized production role grant, checked against the confirmed account ID, email, password-backed account, and verification. It does not seed users or apply an email-based grant to future registrations. Plan schema changes so the previous live Worker can tolerate a migration that lands before its replacement. A failed publish can leave some migrations applied even if the new Worker never becomes live. Inspect the deployment failure and migration state before retrying; do not replay an applied migration or rewrite its SQL or metadata. If Sites reports a deterministic `SQLITE_*` error for a specifically failed, unapplied migration, correct that unapplied migration and publish a new version. If the applied boundary is unclear, stop and establish it before making another schema change.

## After deployment

A **succeeded** Sites deployment with its returned URL completes publication. A pending or building status does not. Browser smoke testing is a separate production QA task, not a prerequisite for reporting the release.

For production QA, open the live URL signed out and verify public game/player search and the app's email sign-in page. Test registration, verification email, login, password reset, and logout; save and reload a game to check IGDB access and hosted D1 persistence. With two disposable accounts, check friend requests (including the email to the recipient and its Settings link), private-profile access, challenge creation and confirmation, and recipient-only challenge removal. Send a direct message between the two friends and confirm the recipient's header badge counts it, opening the conversation clears it, no email is sent, and a non-friend cannot open or send to the conversation. On a public Site, confirm that private profiles remain hidden from unrelated regular players, while an admin can view them and still send a normal friend request. Verify `account_roles` contains the intended production account grant after `0010` and that account/player APIs expose no roles.

If publication or QA fails, inspect Sites deployment status and Worker logs. Missing `DB` or missing-table errors point to the binding or migration stage; IGDB failures point to runtime secrets or the upstream service; unexpected 401s point to the app session cookie or D1 session lookup.

RGBoner uses only its own email accounts and D1 sessions for personal features. Visitors may open the search page and read game and player search results; libraries, profiles, friendships, challenges, and write APIs require sign-in. Sites audience access and app-level friendships are separate checks. App admins can view any verified profile independently of friendship. Public Site access alone does not grant a visitor access to another player's private library or challenges. Existing ChatGPT-era records remain in D1 but cannot sign in; they are hidden from the new account directory.

## Updates and recovery

- For later releases, review and build the changed source, append any new migrations, save a new version, and deploy it to the same Site. Do not create a replacement Site for routine updates.
- Changing Site secrets requires another deployment of an approved saved version. Changing the Site's sharing audience does not change any player's `is_public` setting in D1.
- To recover from a Worker regression, deploy an earlier compatible saved version. This changes code, **not** D1 data or migration history; first check that the old code can run against the current schema. Repair schema problems with a new forward migration and a new version. Plan data backup and restore separately before any destructive schema or data operation.
- Use the Site's deployment status, settings, database view, and Worker logs to diagnose production issues. Keep production records and local test data separate.

For current Sites controls, version behavior, access options, and limits, consult the [Sites developer guide](https://learn.chatgpt.com/docs/sites) and [Creating and managing ChatGPT Sites](https://help.openai.com/en/articles/20001339-creating-and-managing-chatgpt-sites).
