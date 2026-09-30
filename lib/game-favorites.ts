import { getDb } from "../db";
import type { gameFavorites } from "../db/schema";
import { gameFavoritesQuery } from "./game-favorite-queries";

export type GameFavorite = Omit<typeof gameFavorites.$inferSelect, "userId">;

export async function getGameFavorites(userId: string): Promise<GameFavorite[]> {
  return (await getDb().$client.prepare(gameFavoritesQuery).bind(userId).all<GameFavorite>()).results;
}
