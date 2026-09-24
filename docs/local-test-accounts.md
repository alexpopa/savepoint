# Local test accounts

This page describes the sample accounts currently stored in this checkout's local D1 database under `.wrangler/state`. These records are local database state, not migration seed data, so a fresh or reset local database will not automatically contain them.

## Replacement accounts

The five legacy fixture accounts were replaced with new email accounts using the same display names and test email addresses. Their local email status is verified, their existing public/private settings were preserved, and each has 20 saved games.

| Display name | Test email | Local email status | Profile visibility | Saved games |
| --- | --- | --- | --- | ---: |
| CozyCritic | `cozy.critic@savepoint.test` | Verified | Public | 20 |
| PixelNomad | `pixel.nomad@savepoint.test` | Verified | Public | 20 |
| Player Two | `player2@sites.test` | Verified | Private | 20 |
| RetroRanger | `retro.ranger@savepoint.test` | Verified | Public | 20 |
| Seedy | `seedy@sites.test` | Verified | Private | 20 |

Each library was randomly selected from the previous local fixture catalog. Game selections may overlap between accounts. The existing game and platform metadata was retained for each selected record.

All five accounts have accepted friendships with the local `BlazeCloud` account. `Verified Test` remains an accepted friend as well. `Auth Smoke` and `Pending Search Test` are separate, unverified local accounts and are not included in this list.

## Credentials and email delivery

Passwords are intentionally omitted from repository documentation. Use the credentials shared separately for these local accounts, or request a password reset while running the local app with `AUTH_EMAIL_MODE=console` and open the reset link printed in the development server log.

The `.test` email domains are reserved for testing and do not receive normal email. The verified status described here is local D1 state for test accounts; it does not represent verification of a deliverable mailbox.
