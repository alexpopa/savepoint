# RGBoner

A retro, RGB-styled social library for video games.

Site title: **RGBoner — Great Games. Questionable Taste.**
Meta description: “Show off your collection, defend your Top 10, and challenge your friends.”

## Features

- **Library** — track the games you own, per platform
- **Connected libraries** — a dedicated page in the account menu, with separate Steam, Xbox, PlayStation, and RetroAchievements cards showing connection status and Connect or Manage actions
- **Steam import** — connect Steam, automatically match your collection to IGDB, add matched games with one Import all games button, and resolve and import unmatched games in one click, and manage games through the shared library popup, including SteamVR and a Recently updated filter
- **PlayStation games and trophies** — paste your NPSSO token from Sony to see the games you’ve played on PS5, PS4, PS3, and PS Vita, with playtime; add them the same way as Xbox games; and show trophies, your trophy level, and platinums on your profile and in your friends’ timeline. Reconnect every couple of months when Sony’s sign-in expires.
- **RetroAchievements games and achievements** — link your RetroAchievements account by putting a short code in your RA motto, see every retro game you’ve earned achievements in (subsets fold into their main game), add them the same way as Xbox games, and show progress, playtime, and the games you’ve beaten (softcore or hardcore) on your profile and in your friends’ timeline
- **Xbox games and achievements** — sign in with Microsoft to see the games you’ve played on Xbox and PC, most recent first; add them one at a time, as currently playing, or all at once; and show achievement progress on your profile and in your friends’ timeline
- **Status and ratings** — mark games as playing or completed, score them 1–5 stars, and keep your time played (filled in from your connected libraries, or entered by hand)
- **Events** — seasons such as Backlog Season, with a start and end day: every game you play in between counts toward a leaderboard of hours, games beaten, and points, review changes from connected services and accept per game or all at once, independent event results, and manual event hours included in library totals
- **Top 10** — pin your favorites; your #1 cover becomes your profile picture
- **Friends** — timeline with gradual library-batch expansion capped at 100 copies, direct messages, and private profiles shared with friends
- **Challenges** — dare friends on games in their library and keep the best in your Hall of Honor

Anyone can browse games and public profiles; sign in to build a library.

## Tech stack

[Vinext](https://github.com/cloudflare/vinext) (Next.js App Router on Vite) · Cloudflare Workers · D1 + Drizzle · [IGDB](https://api-docs.igdb.com/) for game data

## Getting started

Requires Node.js 22.13+ and IGDB (Twitch) API credentials.

```sh
npm install
cp .dev.vars.example .dev.vars   # add your IGDB client ID and secret
npm run dev                      # http://localhost:5173
```

Set up the local database first — see the [development guide](docs/development.md).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local dev server |
| `npm run check` | Lint, type check, and run tests |
| `npm run build` | Build the Worker |
| `npm run db:generate` | Generate a migration from `db/schema.ts` |
| `npm run db:migrate` | Apply and record pending local D1 migrations |
| `npm run db:status` | List pending local D1 migrations |

## Docs

- [Architecture](docs/architecture.md)
- [Development](docs/development.md)
- [Style guide](docs/style-guide.md)
- [Timeline design](docs/timeline-design.md)
- [Events design](docs/events-design.md)
- [Deployment](docs/deployment.md)
