# RGBoner

A retro, RGB-styled social library for video games.

## Features

- **Library** — track the games you own, per platform
- **Steam import** — connect Steam, automatically match your collection to IGDB, add matched games with one Import all games button, and resolve and import unmatched games in one click, and manage games through the shared library popup, including SteamVR and a Recently updated filter
- **Xbox games and achievements** — sign in with Microsoft to see the games you’ve played on Xbox and PC, most recent first; add them one at a time, as currently playing, or all at once; and show achievement progress on your profile and in your friends’ timeline
- **Status and ratings** — mark games as playing or completed, and score them 1–5 stars
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
- [Deployment](docs/deployment.md)
