# Working on RGBoner

RGBoner is a retro RGB-styled social game library: verified email accounts, IGDB-backed game search, per-platform libraries, friendships, challenges, a Top 10 of favorite games, currently playing status, and a friends timeline. It is a Vinext (Next.js App Router on Vite) Cloudflare Worker with D1 via Drizzle, deployed through ChatGPT Sites. Several AI coding agents work on this repository, so this file is the shared contract. Instructions here outrank habits from other projects.

## Sources of truth

Read what the task touches before changing anything. The code is the final authority; when a document disagrees with it, fix the document in the same change.

| Topic | File |
| --- | --- |
| Entry point and product behavior | [README.md](README.md) |
| Coding conventions and settled decisions | [docs/conventions.md](docs/conventions.md) — read before writing code |
| Behavior, request flow, API, data model, permissions | [docs/architecture.md](docs/architecture.md) |
| Local setup, commands, database and roles | [docs/development.md](docs/development.md) |
| Visual design, brand, accessibility | [docs/style-guide.md](docs/style-guide.md) — read before any UI change |
| Friends timeline rules | [docs/timeline-design.md](docs/timeline-design.md) |
| Releases | [docs/deployment.md](docs/deployment.md) — only when asked to publish |

## Start of every task

1. Run `git status` and `git log --oneline -10`. Uncommitted changes you did not make belong to the user or another agent: build on them, never revert, restyle, or "clean up" them, and mention them in your summary.
2. Read the relevant sources above and the code you will change, including its nearest existing sibling (another route, page, or component doing the same kind of job). Copy that sibling's pattern.
3. If the request conflicts with a rule here or a settled decision in `docs/conventions.md`, say so and ask before proceeding.

## Commands

- `npm run dev` — local preview at `http://localhost:5173/`. Use this for any "preview", "refresh", "restart", or "redeploy locally" request; reuse a running dev server rather than starting a second one.
- `npm run check` — lint, type check, and unit tests. Run it before you finish; a change is not done while it fails.
- `npm run build` then `npm run start` — the built Worker through local Wrangler, only when explicitly asked.
- `npm run db:generate` — generate a migration after editing `db/schema.ts` (see [development](docs/development.md#database-changes)).

## Boundaries

**Always**
- Put new server-side authorization through `hasPermission` / `canViewProfile` in `lib/permissions.ts` so admins keep every permission. Authentication, same-origin writes, input validation, verified accounts, and data integrity still apply to admins.
- Validate every request body on the server and load stored game details from IGDB by ID; never trust client-supplied names, covers, years, platforms, or roles.
- Add a new forward migration for every schema change; treat applied migrations as immutable.
- Update the affected documentation in the same change, describing current behavior with no dated change entries.
- Add a friends timeline entry for any new feature that fits the timeline's rules ([what belongs](docs/timeline-design.md#what-belongs-in-the-timeline)), and document it there.

**Ask first**
- Adding, upgrading, or removing a dependency.
- Schema changes, new tables, or destructive data operations.
- Changes to authentication, sessions, email delivery, or privacy rules.
- Brand changes (wordmark glyphs, logo colors, favicon) or a new design direction.
- Large refactors or reformatting of code outside the task.

**Never**
- Expose another player's role, email, or private data in responses or UI; add admin badges, admin UI, or role mutation endpoints. Role grants are trusted D1 operations only ([development](docs/development.md#roles-and-trusted-administration)).
- Put secrets in source, docs, or browser code, or commit `.dev.vars`.
- Edit generated output (`dist/`, `.next/`, `.vinext/`, `.wrangler/`) or vendored shadcn files in `components/ui/`.
- Commit, push, publish to Sites, or touch production data unless the user asks in this conversation.
- Leave lock files, scratch files, or debug output in the repository.

## Definition of done

1. The change follows [docs/conventions.md](docs/conventions.md) and matches its neighbors.
2. `npm run check` passes. Behavior changes to pure logic or SQL have a test in `tests/`.
3. UI changes were reviewed against the style guide at desktop, 320px width, keyboard focus, and reduced motion.
4. README, architecture, development, and style guide say what the code now does; instructions that no longer apply are removed.
5. Your final message lists what changed, what you verified, what you could not verify, and any uncommitted work you found.

## Commits (when asked to commit)

One logical change per commit, with its documentation. Imperative subject under 72 characters that says what the change does, for example `Add Top 9 cover wall to profiles`. Keep history in Git, not in the docs.
