import { env } from "cloudflare:workers";
import type { CatalogGame } from "./game-types";
import { getIgdbGameCoversForGames } from "./igdb";
import { popularGamesQuery } from "./popular-games-query";

export type PopularGame = CatalogGame & { playerCount: number; catalogIgdbId: number };

type PopularGameRow = {
  igdbId: number;
  playerCount: number;
  name: string;
  coverUrl: string | null;
  releaseYear: number | null;
  platformsJson: string;
};

export async function getPopularRecentGames(now = Date.now()): Promise<PopularGame[]> {
  const since = now - 14 * 24 * 60 * 60 * 1000;
  const database = env.DB;
  if (!database) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  const { results } = await database.prepare(popularGamesQuery).bind(since, now).all<PopularGameRow>();
  const games = results.map((row) => ({
    igdbId: row.igdbId,
    name: row.name,
    coverUrl: row.coverUrl,
    releaseYear: row.releaseYear,
    platforms: JSON.parse(row.platformsJson) as string[],
    platformOptions: [],
    playerCount: row.playerCount,
  }));
  const missingCovers = games.filter((game) => !game.coverUrl);
  if (!missingCovers.length) return games.map((game) => ({ ...game, catalogIgdbId: game.igdbId }));
  try {
    const covers = await getIgdbGameCoversForGames(missingCovers.map(({ igdbId, name, releaseYear }) => ({ igdbId, name, releaseYear })));
    return games.map((game) => {
      const recovered = covers.get(game.igdbId);
      return { ...game, coverUrl: game.coverUrl || recovered?.coverUrl || null, catalogIgdbId: recovered?.catalogIgdbId ?? game.igdbId };
    });
  } catch {
    return games.map((game) => ({ ...game, catalogIgdbId: game.igdbId }));
  }
}
