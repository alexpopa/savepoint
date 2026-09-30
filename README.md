# RGBoner

RGBoner is a social library for video games. Search games and players, track the games you own by platform, and share your library with friends.

Players can mark games they are currently playing or have completed, score any game from one to five stars, pick up to ten favorites for their profile, and create challenges around games in friends' libraries. Up to six completed challenges can be kept in the player's Hall of Honor. The #1 favorite's cover is the player's profile picture when the art is available and the profile is visible. Browse games and public profiles without an account; sign in to manage a library and connect with other players. Private profiles are shared with accepted friends.

Game information comes from IGDB. The app runs on Cloudflare Workers with D1 and Drizzle, using Vinext for its Next.js App Router app.

## Run locally

Requires Node.js 22.13 or newer, npm, and IGDB API credentials. Follow the [local setup guide](docs/development.md) to configure `.dev.vars` and initialize the local database, then run:

```sh
npm run dev
```

The app is available at `http://localhost:5173/`. Run `npm run check` for lint, type checks, and tests.

## Project guides

- [Architecture and app behavior](docs/architecture.md)
- [Development and database workflow](docs/development.md)
- [Visual style guide](docs/style-guide.md)
- [Friends timeline rules](docs/timeline-design.md)
- [Deployment](docs/deployment.md)
