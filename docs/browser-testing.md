# Browser testing

How an agent (Claude Code, ChatGPT/Codex, or any other) signs in and checks a UI change in a real browser against the **local** dev server. Everything here reads and writes the local D1 database under `.wrangler/state` only. Nothing touches the hosted Site, its database, or the ChatGPT Sites publish flow.

## Quick start

```sh
npm run dev                  # once; reuse a running server on http://localhost:5173
npm run browser:install      # once per checkout; installs tools/browser only
npm run test-account         # creates or refreshes AgentTester; safe to re-run
npm run browser -- /library  # 1280px and 320px screenshots, overflow and console errors
```

`npm run browser` prints the screenshot paths. Open them to look at the result. `npm run test-account` needs the dev server running because it adds games through the app's own API.

## The test account

| | |
| --- | --- |
| Display name | `AgentTester` |
| Email | `agent.tester@savepoint.test` |
| Password, account ID | `docs/agent-test-account.local.md` (gitignored, written by `npm run test-account`) |
| Profile | Public, at `/users/AgentTester` (you see it at `/profile` when signed in as it) |
| Library | 12 real IGDB games with covers on real platforms |
| Friend | `CozyCritic`, accepted, so the home timeline has friend activity |

**AgentTester is yours to change.** Rate, complete, favorite, add, remove, or challenge freely, and leave the results in place; the next agent can run `npm run test-account -- --reset` to clear its library, scores, favorites, and challenges and re-seed the 12 games. The password stays the same across runs.

**Other local accounts** (CozyCritic, PixelNomad, Player Two, RetroRanger, Seedy, BlazeCloud; see [local test accounts](local-test-accounts.md)) are shared fixtures. Sign in as them to see another player's view, but do not change their data. If a check needs one of them to act (for example a friend completing a game so it appears in AgentTester's timeline), undo it afterward. Their libraries use legacy fixture IGDB IDs without covers, so their games cannot be scored or favorited, and their game dialogs show “not available in IGDB”. Use AgentTester's games for anything that needs real IGDB data.

## Signing in

You do not need the password for scripted checks. The browser helper creates a one-day session row for any verified local account by display name and sets the `rgboner_session` cookie. Session tokens must be 64 lowercase hex characters; anything else reads as signed out, silently.

- `--as <DisplayName>` (CLI) or `openBrowser({ as: "CozyCritic" })` (script): signed in as that player, for example to see AgentTester's profile as a friend.
- `--guest` or `openBrowser({ as: null })`: signed out, for public-profile and sign-in-prompt checks.
- To test the sign-in form itself, fill it with the email and password from `docs/agent-test-account.local.md`.

## Scripted checks

For anything beyond screenshots, write a short script **outside the repository** (your scratch or temp directory) and run it with `node`:

```js
import { openBrowser } from "/absolute/path/to/repo/tools/browser/browser.mjs";

const b = await openBrowser({ as: "AgentTester", width: 1280 });
await b.goto("/library");                                   // waits for network idle; throws if redirected to /login
await b.page.locator(".game-card-open").first().click();    // opens the game dialog
await b.page.getByRole("button", { name: "Rate 4 out of 5 stars" }).click();
await b.page.getByLabel("Sort").selectOption("score");      // real select, no React workaround needed
console.log(await b.shot("library-rated"), await b.overflows(), b.errors);
await b.setViewport(320);
await b.close();
```

`openBrowser` returns Playwright's `page` plus `goto`, `shot(name, { full })`, `setViewport(width)`, `overflows()` (true when the page scrolls sideways), `errors` (console and page errors), and `close`. Pass `reducedMotion: "reduce"` to check reduced motion. Screenshots go to `$RGBONER_SHOTS` or the system temp directory's `rgboner-browser/`, never the repository. Prefer role and label locators (`getByRole`, `getByLabel`); they double as a check of accessible names.

Browser choice: `CHROME_PATH` if set, then a preinstalled Playwright browser when `PLAYWRIGHT_BROWSERS_PATH` is set (cloud sandboxes), otherwise locally installed Google Chrome. Nothing downloads a browser.

## Checking a UI change

The [definition of done](../AGENTS.md#definition-of-done) asks for these; the helper covers each:

1. Desktop and 320px: `npm run browser -- <path>` flags horizontal overflow at each width.
2. Keyboard focus: `await b.page.keyboard.press("Tab")` or `locator.focus()`, then `shot`.
3. Reduced motion: `openBrowser({ reducedMotion: "reduce" })`.
4. Another player's view: `--as CozyCritic` on `/users/AgentTester`, and `--guest`.
5. Friend timeline: act as AgentTester, then view `/` as CozyCritic. AgentTester's own activity never appears in its own timeline.

Say in your summary which of these you ran.

## Local database

`npm run d1 -- "<SQL>"` runs SQL against local D1 and prints the rows as JSON, for example `npm run d1 -- "SELECT id, name, completed_at FROM library_items WHERE user_id = '<AgentTester ID>'"`. It uses a generated config in `.wrangler/agent-d1.json`, so it does not need `npm run build`. Scripts can import `d1`, `lit` (SQL literal quoting), `findAccount`, `mintSession`, and `appFetch` (a same-origin API call as a signed-in player) from `scripts/local-dev.mjs`.

After a schema change, apply the new migration to local D1 before browser checks (see [development](development.md#database-changes)); otherwise pages that read the new columns fail with a missing-column error.

## Keeping this away from Sites

`playwright-core` lives in its own package at `tools/browser/` with its own lock file and ignored `node_modules/`. The Sites install (`npm run install:ci`, `npm ci` on the root lock file) and the Worker build never see it. **Do not add browser tooling to the root `package.json` or `package-lock.json`:** the Sites install caches dependencies by the root lock file's hash, so any change there makes the hosted install fetch from the registry again. The npm scripts above are root `package.json` entries only, which do not change the lock file.
