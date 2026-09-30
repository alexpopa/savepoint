# Local test accounts

This page describes the sample accounts currently stored in this checkout's local D1 database under `.wrangler/state`. These records are local database state, not migration seed data, so a fresh or reset local database will not automatically contain them.

## AgentTester

`AgentTester` (`agent.tester@savepoint.test`) is the account agents sign in as for browser checks. `npm run test-account` creates it with 12 real IGDB games and an accepted friendship with CozyCritic; its password is in the gitignored `docs/agent-test-account.local.md`. Agents may change its data freely. See [browser testing](browser-testing.md).

## Replacement accounts

The five legacy fixture accounts were replaced with new email accounts using the same display names and test email addresses. Their local email status is verified, their existing public/private settings were preserved, and each has 20 saved games.

| Display name | Test email | Local email status | Profile visibility | Saved games |
| --- | --- | --- | --- | ---: |
| CozyCritic | `cozy.critic@savepoint.test` | Verified | Public | 20 |
| PixelNomad | `pixel.nomad@savepoint.test` | Verified | Public | 20 |
| Player Two | `player2@sites.test` | Verified | Private | 20 |
| RetroRanger | `retro.ranger@savepoint.test` | Verified | Public | 20 |
| Seedy | `seedy@sites.test` | Verified | Private | 20 |

Each library was randomly selected from the previous local fixture catalog. Game selections may overlap between accounts. Some retained rows use fixture IDs instead of current IGDB IDs and have no saved cover URL; public profiles resolve those by exact title and release year for display and game details.

All five accounts have accepted friendships with the local `BlazeCloud` account. `Verified Test` remains an accepted friend as well. `Auth Smoke` and `Pending Search Test` are separate, unverified local accounts and are not included in this list.

## Credentials and email delivery

Passwords are intentionally omitted from repository documentation. Use the credentials shared separately for these local accounts, or request a password reset while running the local app with `AUTH_EMAIL_MODE=console` and open the reset link printed in the development server log.

The `.test` email domains are reserved for testing and do not receive normal email. The verified status described here is local D1 state for test accounts; it does not represent verification of a deliverable mailbox.
